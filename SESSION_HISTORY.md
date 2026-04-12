# Rehearsal Block Session History

Archive of detailed per-session notes for the Rehearsal Block project.
Lives outside `CLAUDE.md` so it doesn't bloat per-session startup tokens.
The trimmed `CLAUDE.md` references this file when historical context is
needed.

---

## Mobile pass + settings reorg + list view polish + chip fade + PDF rewrite (2026-04-11)

Long, multi-topic session. Touched mobile responsiveness, the settings modal organization, the list view, the cast/crew chip overflow treatment, the day editor's "Who's called" panel, and the PDF export pipeline. All changes verified and 0 typecheck errors at the end.

**Mobile Phase 1** (the start of the session - see the "Archived: Mobile audit (2026-04-10)" section at the end of this file for the before-state that this work addressed):
- **`pnpm dev` now runs `vite dev --host`** so the dev server is accessible on the LAN. Real-device testing is just `http://<lan-ip>:5173/demo` from a phone on the same Wi-Fi
- **`/demo` toolbar overflow fix.** The 12-button toolbar was 575px wide at 375px viewport, pushing horizontal scroll. Added a `@media (max-width: 768px)` rule that wraps groups 1-4 (7 buttons: view toggle / prev / scope / next / filter / undo / redo) on row 1 and forces group 5 (5 buttons: settings / export / collect / share / save) onto row 2 via `flex-basis: 100%` on `:nth-child(5)`. Also drops the inter-group separators on mobile.
- **App header mobile rework** in `+layout.svelte`. Logo + 3 nav items used to wrap to 2 rows (142px tall). Now: logo left, hamburger button right, single 56px row. Tapping the hamburger drops a nav panel down (Demo / Sign In / Buy Now stacked). Click outside or Escape closes. The brand logo is capped to `height: 32px; max-width: 180px` on mobile.
- **Mobile defaults on `/demo`** with sticky preferences. On first visit at <= 768px viewport (no stored prefs), the page opens in list view with both sidebars collapsed and scope = Overview. Stored under `rehearsal-block:mobile-prefs` so subsequent visits remember whatever the user picked. A `mobilePrefsHydrated` flag guards the persistence `$effect` so the initial default-value read doesn't overwrite stored prefs before `onMount` loads them.
- **Em dash fix** in landing page reel: "The cast —" → "The cast -"
- **Toolbar dropdowns become bottom sheets on mobile.** Scope / Filter / Export / Share dropdowns were anchored to 40px-wide buttons via `position: absolute; left: 50%/right: 0`. At phone width they extended off-screen. Mobile media query overrides them to `position: fixed; bottom: 0; left: 0; right: 0; max-height: 70vh; border-radius: 12px 12px 0 0` - thumb-friendly bottom sheets that sidestep all anchor math.
- **Settings modal mobile fixes**: tab nav wraps to 2 rows of 3, so all 6 tabs (Appearance / Schedule / Event Types / Locations / Contacts / Show) are reachable. Schedule's "Call times per weekday" rows stack day-name above times. Contacts header action buttons wrap. Expanded actor cards collapse the 4-column / 3-column grids to single column with `!important` (the base rules sit later in the source so the override needs higher specificity).
- **Sidebar collapse arrows muted on mobile.** The teal arrow on collapsed left/right sidebars was confusing because it sat at the top of the screen and looked like page navigation. Mobile media query drops opacity to 0.55 and switches color to `--color-text-subtle` so it recedes.
- **Calendar grid 7-column overflow safety net.** At 375px the inner `.week` grid still tries to be 7 columns × 40px each, with content overflowing horizontally. Added `overflow-x: hidden` on `.scheduler-grid` (NOT on `.demo-inner` - critical, see next bullet) so any accidental Calendar-mode rendering at phone width clips internally instead of scrolling the whole page.
- **Sticky toolbar on mobile, just the toolbar (no title).** Used `display: contents` on `.sticky-bar` at mobile so its children (`.show-title-line` and `.toolbar`) become direct children of `.demo-inner` for layout purposes. The toolbar then uses `position: sticky; top: 0` with the full page as its containing block. The title scrolls away naturally; the toolbar stays pinned. Toolbar background spans edge-to-edge via negative margins matching the container's horizontal padding.
- **Title separator removed.** Got rid of the hardcoded `&middot;` in `<span class="title-sep">` between show name and dates.

**View toggle rename.** Calendar/List toggle tooltip now says "Switch to calendar mode" / "Switch to list mode" so it doesn't compete with the "View: Overview / Month / Week / Day" scope label.

**List view polish:**
- **Removed redundant location-row footer** from regular call rows in list view. The location was being rendered both as `@ {location}` inline next to each call AND as a row of location pills below all the calls. Dropped the bottom row for regular days (kept it for dress/perf days where calls don't show locations inline). Each regular rehearsal day now saves ~24px vertical.
- **`@` symbol replaced with Material Symbols location pin SVG** (`location_on`). Pin sits inline with the location text via `display: inline-flex; gap: 2px` and inherits the location color via `currentColor`.
- **List view max-width 620px on desktop, centered between sidebars** via `margin: 0 auto`. Same width as ~3 calendar columns. On mobile the auto margins collapse (max-width is the only constraint).
- **All 8 font size settings now apply to list view** too. Wired `--size-event-type / time / description / cast-badge / group-badge / notes / location / conflicts` into the list view CSS (event type badge, call time, call desc, location, day notes, conflict footer, all-called chip). CastChip and GroupChip already used `--size-cast-badge` / `--size-group-badge` internally so those propagated for free.

**Day editor "Who's called" rebuild** (was the cast-only checklist):
- Added a Cast/Team toggle pill matching the left sidebar's `.sidebar-view-toggle` styling (teal pill with chevron). Switches the panel between cast and crew with single click.
- **Groups list always visible** (in both Cast and Team mode). All Called appears as a pseudo-group at the top of the list with a checkbox bound to `call.allCalled`, label/color from `show.settings.allCalledLabel/Color`, and member count subtitle.
- Group swatches now use the **same fallback chain as `GroupChip.svelte`**: `group.color ?? locationColor(group.id) ?? "#6a1b9a"`. Previously they all defaulted to plum because `locationColor` wasn't being called. Now Montagues correctly fades to orange and Capulets to purple via the deterministic id hash.
- New helpers: `toggleGroup`, `toggleCrew`, `toggleAllCalled`. The All / None buttons are mode-aware now (operate on cast OR crew based on the toggle).
- Crew rows in Team mode show the colored square + name + role. Empty state hint when `show.crew.length === 0`.

**Empty cell event type bug.** `emptyDay()` in `+page.svelte` had a fallback `?? doc.eventTypes[0]?.id ?? ""` that auto-selected "Rehearsal" (the first event type) on every blank cell click, even when no default was set in Settings > Schedule. Now matches `dropShell()`'s logic: only assigns an event type if `doc.settings.defaultEventType` exists and points to a real event type, otherwise returns `eventTypeId: ""`.

**Settings modal reorganization** (Appearance + Schedule tabs):
- **Moved "Time format" + "Week starts on"** from Appearance → Schedule
- **Moved "Group drop behavior"** from Schedule → Appearance (Blake considers it a visibility-adjacent display rule)
- New Appearance order: Theme → Visibility → Group drop behavior → Fonts → Font sizes
- New Schedule order: Time picker increments → Call times per weekday → Dress/Performance call window → Holidays → Time format → Week starts on
- Font selectors capped at `width: 14rem` (was `flex: 1` stretching across the row)
- Show title bar weekday cell sizing fixes (call times per weekday): day name + times cluster left, the cell hugs content via `width: fit-content` instead of stretching across the section
- Day name `.weekday-toggle` no longer has `flex: 1` (was pushing the time pickers to the far right). Now `flex: 0 0 auto; min-width: 7.5rem` so day names stay aligned and times sit right next to them.

**Round plum checkboxes.** Added a global `input[type="checkbox"]` rule in `app.css` that removes browser-default styling (`appearance: none`), draws a round outline, fills with plum and shows a CSS-only white checkmark when checked. Applied app-wide so settings, day editor, modals, and filter dropdowns all share the same look.

**Sidebar count opacity tweak.** The `(8)` / `(7)` count next to the Cast/Team toggle is `rgba(255, 255, 255, 0.5)` (used to be `opacity: 0.8` which read teal-tinted on the teal background; explicit white-with-alpha stays neutral).

**Cast/Crew/Group chip text overflow → fade overlay.**
- New file `packages/standalone/src/lib/fade-when-clipped.ts` exports a Svelte action `fadeWhenClipped` that watches an element with a `ResizeObserver`, compares `scrollWidth > clientWidth + 0.5`, and toggles `is-overflowing` on the closest `.chip` / `.group-chip` / `.crew-chip-sidebar` ancestor.
- Applied to `.chip-character` in CastChip, `.group-name` in GroupChip, and `.crew-sidebar-label` (`.crew-sidebar-role` in both mode) in Sidebar.
- CSS rule on each chip: when `.is-overflowing` is present, render a `::after` overlay positioned absolute at `right: 0` that's a 20px-wide gradient fading transparent → chip background. Final dimensions after iteration: **15px fade + 7px solid buffer = 22px total**, gradient stops at `0% transparent → 68% solid → 100% solid`. The buffer keeps the chip's right border breathing room from the faded text.
- **Border stays intact**: the overlay sits inside the chip's content area (positioned via `right: 0` which aligns to the inner padding edge), so the chip's border, border-radius, and colored left stripe are unaffected.
- **Ellipsis preserved alongside fade**: the inner text spans (`.chip-character`, `.crew-sidebar-role`, `.group-name`) keep `text-overflow: ellipsis + min-width: 0` so when they shrink they show "..." in their own (muted) color, then the chip's fade overlay sits on top. Soft fade with a faint dot trail underneath.
- **Crew chip "both" mode markup restructured**: the role overflow ellipsis used to inherit the dark label color because `text-overflow: ellipsis` was on `.crew-sidebar-label` (the parent). Split into `.crew-sidebar-name` (stays dark, doesn't shrink) + `.crew-sidebar-role` (muted, shrinks, has its own ellipsis) inside a new `.crew-sidebar-label-both` flex container. Ellipsis now matches the role's muted color.
- **Group chip in sidebar gets natural sizing.** Used to be `flex: 1` (always full row width). Now `flex: 0 1 auto; min-width: 0; max-width: 100%` so short groups hug their content and long groups shrink to share space with the edit/delete action buttons. `.group-actions` got `flex-shrink: 0` so the buttons never get squeezed. `:global(.group-name)` overrides removed `max-width: 180px` for natural sizing inside the constrained chip.

**Contact tooltips for crew chips.** Crew chips in the sidebar now have a `title="${firstName} ${lastName} - ${role}"` attribute matching CastChip's existing pattern. Hover any team member in the sidebar for the full name + role.

**Color picker portal fix.** The group color picker popover (used for editing All Called and group colors) was getting visually clipped at the right edge by the calendar grid even though it was `position: fixed` with `z-index: 120`. Root cause: `.scheduler-sidebar` ancestor has `position: sticky + overflow: hidden` which (Chromium quirk, against spec) clips fixed descendants. Fix: a small `portalToBody` Svelte action (10 lines) that does `document.body.appendChild(node)` on mount and `node.remove()` on destroy. Applied via `use:portalToBody` to a single hoisted popover instance (replacing the two duplicate inline copies that used to live inside each form). The popover now lives at the body level so nothing can clip it.

**PDF calendar export rewrite** (the biggest single change in this session):
- **Original problem**: enabling Scale > 100% in the export modal pushed the footer (logo / page numbers / download date) off the page entirely. Puppeteer's `page.pdf({ scale })` option scales body content but doesn't expand the bottom margin reservation, so content bleeds into the footer area.
- **Final solution**: server-side `/api/pdf` rewrites every `font-size: Npx` declaration in the embedded `<style>` block via regex, multiplied by the user scale. This catches every class without enumeration. Plus a proportional `min-height` bump on `.day-cell`. Plus an explicit override that restores `.print-header h1` to 22px and `.print-header .dates` to 11px so the show title at the top of page 1 stays unscaled. Plus structural overrides: `.print-page { display: block !important }` (was flex, which prevented Chromium's natural page breaks from splitting content) and `.page-content { flex: none !important }`.
- **Why not CSS zoom**: tried it. CSS `zoom` interacts badly with `page-break-inside: avoid` on `.week-row`, causing Chromium to put one row per page even at 1.5x scale. Font-size scaling is cleaner because `.week-row` cells auto-grow to their tallest content and Chromium's normal page break algorithm splits without surprises.
- **Why not Puppeteer scale**: tried that first. Doesn't expand the footer's margin reservation. Always wins the "footer pushed off page" race.
- **Title-on-all-pages bug fix**. With `repeatTitle: true`, the server uses Puppeteer's `headerTemplate` (rendered separately in the top margin). The original template had a Google Fonts `<link rel="stylesheet">` for Playfair Display, but Chrome's `printToPDF` runs the header/footer template in an isolated context that does NOT fetch external stylesheets, throwing `Protocol error (Page.printToPDF): Printing failed`. Switched to web-safe Georgia/system-ui fonts. Also wrapped the template in a single root element (Chromium quirks with multiple top-level nodes).
- **`.print-header` strip bug fix**. The server strips the in-body `.print-header` when `repeatTitle` is on (since Puppeteer's headerTemplate handles the header instead). The original strip used a non-greedy regex `/<div class="print-header">[\s\S]*?<\/div>/` which matched the first `</div>` inside `.print-header` (the nested `.dates` closer), leaving the actual `.print-header` closing `</div>` orphaned and breaking the HTML. Replaced with a depth-walking algorithm that handles any nested structure correctly.
- **Shared template module**. New file `packages/standalone/src/lib/pdf-templates.ts` exports `buildPdfHeaderHtml`, `buildPdfFooterHtml`, `hasPdfFooter`, and `FOOTER_LOGO_SVG`. The server's `/api/pdf` endpoint imports these for Puppeteer's `headerTemplate` / `footerTemplate`. The export modal preview iframe also imports them so the in-iframe header/footer looks identical to the downloaded PDF.
- **Modal preview alignment**. Used to use `transform: scale()` on the body for preview scaling, which scaled the header and footer along with the grid - misleading because the actual download only scales the grid. Now applies the same regex font-size rewrite to `_head` (the original `<style>` content) plus the same override CSS. The `.print-header` from the source body is filtered out of every page chunk and the styled Puppeteer-template header is injected on appropriate pages instead. Pagination measures heights from the modified iframe so it sees the new sizes.
- **Date format unified**. The modal used to send `${start.toLocaleDateString(...)} - ${end.toLocaleDateString(...)}` which produced "May 3, 2026 - June 14, 2026" with the year duplicated. Now uses `formatUsDateRange(start, end)` which truncates the redundant year when start/end share one: "May 3 - Jun 14, 2026".
- **Continuous-mode HTML structure unchanged**. The continuous (auto) page break mode for both calendar and list returns flat output - direct body children (`.weekday-row` + many `.week-row` for calendar, many list-day blocks for list) without an outer `.print-page > .page-content` wrapper. Months mode keeps its per-month wrapper. Modal pagination iterates body children and packs them into pages by measured height.
- **Verification harness**: new `packages/standalone/scripts/debug-calendar-pdf.mts` posts the demo show to `/api/pdf` with various scale + mode combinations, saves each PDF, and renders every page to PNG via pdfjs-dist + @napi-rs/canvas. Used heavily this session to iterate without bothering Blake. Output in `scripts/out/`.
- **Accent color picker removed**. The export modal no longer has an "Accent color" picker. The header underline is now hardcoded `#4b5563` (Tailwind gray-600) - a step darker than the existing `--color-text-muted`. `accentColor` field removed from `PrintOptions` interface in `packages/core/src/export.ts`. Old `.color-setting` CSS class also removed from `ExportModal.svelte`.
- **PDF call-block separator fix**. The PDF used `border-top: 1px dashed #e5e7eb` between adjacent `.call-block` elements in a multi-call cell. The grid view (`DayCell.svelte`) uses `1px solid var(--color-border)`. Changed PDF to match: `1px solid #e5e7eb`. May 13 (which has 3 calls) and any other multi-call cell now matches the calendar's appearance.

**Right toolbar pill colors.** Changed the right day-tool sidebar's add-shortcut pills:
- **Call pill**: `#1565c0` background with `#0d47a1` hover (Material Blue 800/900). Was orange `#d97706 / #b45309`.
- **Note pill**: `#6a1b9a` background with `#4a148c` hover (Material Purple 800/900). Was slate `#475569 / #334155`.
Matches the dark text colors of the corresponding event-type badges (Blue rehearsal, Purple dress rehearsal) for visual consistency.

**Files touched** (across the whole session):
- `packages/core/src/export.ts` - PrintOptions interface (drop accentColor), .print-header CSS color, .call-block separator, continuous-mode HTML revert
- `packages/standalone/src/app.css` - global round plum checkbox style
- `packages/standalone/src/routes/api/pdf/+server.ts` - regex font-size rewrite, structural overrides, depth-walking print-header strip, headerTemplate web-safe fonts, shared template imports
- `packages/standalone/src/lib/pdf-templates.ts` (NEW) - shared header/footer HTML builders + FOOTER_LOGO_SVG
- `packages/standalone/src/lib/fade-when-clipped.ts` (NEW) - ResizeObserver-based overflow detection action
- `packages/standalone/src/routes/+layout.svelte` - mobile hamburger, brand logo cap, footer
- `packages/standalone/src/routes/demo/+page.svelte` - mobile defaults + sticky prefs, toolbar mobile media query, dropdown bottom sheets, scope scroll-to-top, emptyDay event-type fix, title-sep removal, em dash, scheduler-grid overflow safety net
- `packages/standalone/src/lib/components/scheduler/Sidebar.svelte` - count opacity, collapse arrow muting, group chip natural sizing, fade-when-clipped wiring, crew "both" mode restructure, color picker portal, crew chip title attribute
- `packages/standalone/src/lib/components/scheduler/CastChip.svelte` - fade overlay + ellipsis combo, fadeWhenClipped action wiring
- `packages/standalone/src/lib/components/scheduler/GroupChip.svelte` - fadeWhenClipped action wiring, locationColor fallback
- `packages/standalone/src/lib/components/scheduler/DayCell.svelte` - (no changes this session beyond reading)
- `packages/standalone/src/lib/components/scheduler/DayToolSidebar.svelte` - call/note pill colors
- `packages/standalone/src/lib/components/scheduler/ListView.svelte` - location row removal, pin SVG, font-size variables, max-width + center
- `packages/standalone/src/lib/components/scheduler/DayEditor.svelte` - "Who's called" rebuild with Cast/Team toggle, groups always visible, All Called pseudo-group, locationColor fallback
- `packages/standalone/src/lib/components/scheduler/DefaultsModal.svelte` - tab nav wrap, settings reorder, font select width, weekday row stacking, expanded card grid stacking, contact button wrap
- `packages/standalone/src/lib/components/scheduler/ExportModal.svelte` - shared pdf-templates import, accent color picker removal, formatUsDateRange, modal preview alignment with server, page chunk header/footer injection
- `packages/standalone/scripts/debug-calendar-pdf.mts` (NEW) - debug renderer for PDF iteration
- `packages/standalone/package.json` - `dev` script now passes `--host` to vite
- `MOBILE_AUDIT.md` (NEW at repo root) - the before-state findings doc
- `CLAUDE.md` - this entry, plus the new "Next session: replace landing-page hero scroll animation with a loop" section above

---

### Right sidebar (day-tool palette) + drop-flow polish, multi-day drops, warnings, deselect UX (2026-04-10, session 3)

Long session that built the right day-tool sidebar from scratch, then iterated heavily on drag/drop semantics and deselect UX across the whole scheduler grid. 0 typecheck errors throughout.

**New component: `DayToolSidebar.svelte`**
- Second sidebar on the right of the `.scheduler` grid, mirroring the left sidebar's collapse + sticky behavior via a new `rightSidebarCollapsedPref` state. Auto-collapses when the day editor opens (both share the third grid column); restores the user's prior preference on close.
- Sections: **EVENT TYPE** (draggable pills per `show.eventTypes`), **LOCATION** (draggable pills per `locationPresetsV2`, rendering `effectiveLocationShape` character ●★▲■ instead of the original circle), **ADD** (Call + Note pills, each on its own row).
- Call pill: amber `#d97706` background with clock icon. Note pill: slate `#475569` background with pencil-tip icon. Both solid with white text.
- Inline **+** buttons next to "Event Type" and "Location" headers to add items without opening the Defaults modal. Clicking + swaps an input in place; Enter commits, Escape/blur cancels. New event types cycle through a 7-color `EVENT_TYPE_PALETTE` (blue/orange/purple/red/slate/green/amber). New locations delegate to existing `addLocationPreset`.
- Pills are 5px/10px padded, font-size 0.78rem for easier touch/grab targets.
- "Day Tools" title is a teal pill matching the left sidebar's new Cast/Team toggle treatment.
- Contents right-justified (header title via `margin-left: auto`, `.drag-hint` `text-align: right`, `.section-title` `text-align: right`, `.tool-section` `align-items: flex-end`, `.pill-wrap` `justify-content: flex-end`, `.section-add-input` `text-align: right`, `.add-section` stacks vertically with flex-end alignment).

**New dataTransfer types wired through DayCell, ListView, CalendarGrid:**
- `text/rb-event-type` / `text/rb-location` / `text/rb-call` / `text/rb-note` - right-sidebar drops
- `text/rb-move-actor` / `text/rb-move-crew` / `text/rb-move-group` / `text/rb-move-all-called` - drag an in-cell chip from one call block to another on the same day. Payload format `sourceCallId|id` (pipe-delimited). `effectAllowed: "copyMove"` so the target's `dropEffect: "copy"` is compatible.
- `CastChip.svelte` and `GroupChip.svelte` got new `draggable` / `ondragstart` props. DayCell and ListView pass these on all in-cell chip renders with handlers like `dragMoveActor(e, call.id, member.id)`.

**Drop semantics polish:**
- `dropShell(iso)` replaces `emptyDay` for drag-drop creation: no forced `eventTypeId` (only honors `Settings.defaultEventType`), no weekday-default calls seeded. Used by Event Type / Location / Call / Note drops AND by `ensureCallForDrop` which feeds actor/crew/group drops too.
- **Blank-day actor drop** now just creates an untimed placeholder call containing the chip (time/endTime both `""`), nothing else. DayCell hides the `.time` div when `timeRange(call)` is empty. When the user later drops a Call chip, `dropCallOnDate` promotes the placeholder in place (fills time from weekday defaults + sets `manuallyAdded: true`) instead of appending a new call - so the chips already on the day automatically belong to the new timed call.
- **Call chip drop** opens the per-call description inline editor on the cursor target via `startInlineEdit(iso, "description", cursorCallId)`.
- **Multi-day fan-out**: when the cursor target is part of `selectedDates.size > 1`, the drop applies to every selected day. Applied to Event Type, Location (except per-call), Call, Note, AND to the previously single-day actor/crew/group/allCalled handlers (via new `cellLevelTargets(iso, callId?)` helper). Per-call drops (callId present) don't fan out because call ids don't match across days.
- **Per-actor blocker skip** during multi-drop: `blockingConflictsFor(actorId, call, doc.conflicts.filter(c => c.date === date))` skips days where the actor is unavailable, silently applying to the others.

**Multi-event-type / multi-location support on a single day:**
- `dropEventTypeOnDate` smart-adds: first type becomes `day.eventTypeId` (primary), subsequent different types append to `day.secondaryTypeIds` (secondary badges, rendered by existing template).
- `dropLocationOnDate` smart-adds: first location becomes `day.location`, subsequent distinct locations append to new `day.extraLocations?: string[]` field (added to core `ScheduleDay` type). Dropping on a specific call (with `callId`) sets `call.location` for that call only via `patchCallAtIndex`. Footer rendering merges all unique locations via updated `uniqueLocations` derivation in DayCell + new `uniqueLocations(day)` helper in ListView.

**Hover-to-show ✕ buttons on cell-level items:**
- New props `onremoveeventtype` / `onremovecall` / `onremovenotes` / `onremovedaylocation` on DayCell, ListView, CalendarGrid (pass-through). Rendered as `.badge-remove` / `.call-remove` / `.notes-remove` / `.loc-remove` buttons.
- Initial version reserved width for the hidden ✕ which added ~13px of dead right-side space on every event type badge. Fixed by collapsing `.badge-remove` to `width: 0; margin-left: 0` when hidden and expanding to `width: 11/12px; margin-left: 2px` on hover, with transitions. Same fix in ListView's badge-remove.
- Demo handlers: `removeEventTypeFromDay` (promotes first secondary to primary when removing the primary), `removeCallFromDay`, `removeNotesFromDay`, `removeLocationFromDay` (clears `day.location` OR removes from `extraLocations` OR clears any `call.location` matches - scrubs the location everywhere on the day).

**Overlap warning indicator:**
- Small amber warning triangle (`<span class="overlap-warning">` with Material Symbols warning SVG) on cells/list rows where any actor is in two or more time-overlapping calls on the same day. Uses existing core helper `overlappingCallsByActor(day, groups, cast)`.
- DayEditor bug fixes:
  1. Was passing `overlappingCallsByActor(day, show.groups)` - missing `show.cast` so All Called overlaps were silently invisible. Added `show.cast` arg.
  2. The per-row `showWarning` was gated on `checked` (directly in `calledActorIds`), so actors called via a group chip (Montagues) or via `allCalled` never showed warnings even when the core helper correctly identified them. Added `effectivelyCalled` derived = `!isBlocked && (checked || call.allCalled === true || call.calledGroupIds.some(gid => Montagues.includes(member)))`.
- Verified end-to-end on May 13 (Mercutio deliberately double-booked) + dropping Montagues on call_split_3 + dropping All Called on call_split_1.

**Fixes discovered during testing:**
- **Spacebar swallowed in inline editors**: `DayCell.handleKey` and ListView's row `onkeydown` were preventing default on Space when the keydown bubbled from a child `<input>` / `<textarea>`. Now early-return when `e.target !== e.currentTarget`.
- **Auto-Rehearsal + default Main Stage on drops**: sample show's `defaultLocation: "Main Stage"` was being inherited by every dropped day. Removed (`defaultLocation: ""`). Description drops were creating phantom time blocks once typing happened because `isCallPopulated` treats day-level description as content for every call, including the hidden weekday-default call seeded by `emptyDay`. Fixed by having all drop handlers use `dropShell` which never seeds a call.
- **Description chip removed entirely** from the right sidebar - Call chip's per-call description editor already covers the day-level description use case the user cared about.
- **`Call.manuallyAdded?: boolean`** added to core Call type. Set by `dropCallOnDate`. `isCallPopulated` (both DayCell and ListView) returns true for manually-added calls even when empty, so time-only drop-created call blocks render visibly.
- **CSS grid transition stuck on collapse** - `transition: grid-template-columns` couldn't interpolate between `minmax(200px, 220px)` and a literal `32px`, leaving the third column stuck. Solution: removed the grid transition entirely on `.scheduler`.

**Multi-day paste conflict modal:**
- `pasteConflict` state refactored from `targetDate: IsoDate` to `targetDates: IsoDate[]`.
- `pasteDay` now builds candidates from `selectedDates` if populated, else `selectedDate`. Checks if ANY target has existing content; if yes, opens modal with "Paste onto N days?" title and "Some of the selected days already have content..." body. Replace/Merge buttons apply uniformly across all targets.
- `executePaste` is a thin wrapper; `executePasteOnTargets(mode, targetDates)` does the real loop.
- Ctrl+V gate in `onWindowKey` now accepts `selectedDate || selectedDates.size > 0`.

**Keyboard / click dismissal overhaul:**
- **Shift+, / Shift+.** hotkeys toggle the left / right sidebars respectively (they use the same keys the day editor reuses for expand/collapse-all-calls, so my new handler gates on `!selectedDate && !any modal open` and sits BEFORE the existing `>`/`<` editor branch in `onWindowKey`).
- **Two-step Escape deselect**:
  1. If editor open → close editor and remove that day from `selectedDates` (other teal days stay).
  2. Else if `selectedDates.size > 0` → clear the whole multi-selection.
- **Outside-click dismissal** (refined based on Blake's mental model):
  - Click on an **interactive** element (button/link/input/role=button etc.) → one-pass: close editor AND clear teal. "User is moving on."
  - Click on **whitespace** (plain divs, show title area) → two-step matching Escape: 1st click closes editor only, 2nd clears teal. "User is just dismissing the editor and wants to keep the multi-select working scope."
  - Detection walks `composedPath` once and sets a `clickedInteractive` flag based on tag name or ARIA role.

**Styling polish (brand):**
- Cast/Team toggle (left sidebar) and Day Tools bubble (right sidebar) both use `--color-teal` fill with white text (went through plum tint → darker plum → teal iterations based on feedback).
- Both drag-hint texts ("Drag onto a day to add") unified to `font-size: 0.6rem; color: var(--color-text-muted); text-transform: uppercase; letter-spacing: 0.04em` (previously left was italic + `--color-text-subtle`, right was not-italic; now both match).
- Cell event type badges padding fixed so the hidden ✕ doesn't reserve 13px of dead right-side space.
- Right sidebar pills tightened to match cell badges, then enlarged (5px/10px, 0.78rem) for grab-friendliness.

**Misc:**
- **Done button** added to the bottom of DayEditor (`.done-row > .btn.btn-primary`) that calls `onclose` - same behavior as the top-right × but a finger-friendly primary action.
- **`formatUsDateRange(start, end)`** added to core/dates.ts: truncates the redundant first year when start/end share a year (`"May 4 - Jun 14, 2026"` instead of `"May 4, 2026 - Jun 14, 2026"`). Replaces 4 call sites: demo show title, ConflictSubmitter header, contact-sheet-pdf, export-docx.

**Files touched:**
- `packages/core/src/types.ts` - `Call.manuallyAdded?`, `ScheduleDay.extraLocations?`
- `packages/core/src/dates.ts` - `formatUsDateRange`
- `packages/core/src/sample-show.ts` - `defaultLocation: ""`
- `packages/standalone/src/lib/theme.css` - `--color-plum-tint` (unused now but kept)
- `packages/standalone/src/lib/components/scheduler/DayToolSidebar.svelte` - NEW
- `packages/standalone/src/lib/components/scheduler/DayCell.svelte` - major extension
- `packages/standalone/src/lib/components/scheduler/ListView.svelte` - major extension
- `packages/standalone/src/lib/components/scheduler/CalendarGrid.svelte` - pass-through props
- `packages/standalone/src/lib/components/scheduler/CastChip.svelte` - draggable props
- `packages/standalone/src/lib/components/scheduler/GroupChip.svelte` - draggable props
- `packages/standalone/src/lib/components/scheduler/Sidebar.svelte` - cast/team toggle teal, drag-hint font
- `packages/standalone/src/lib/components/scheduler/DayEditor.svelte` - overlap `effectivelyCalled`, Done button
- `packages/standalone/src/lib/contact-sheet-pdf.ts` / `export-docx.ts` / `ConflictSubmitter.svelte` - `formatUsDateRange` call sites
- `packages/standalone/src/routes/demo/+page.svelte` - huge: new state, dropShell, `cellLevelTargets`, move handlers, remove handlers, paste refactor, Shift+./,  hotkeys, two-step Escape, refined outside-click, `addEventTypeByName`, Done wiring, etc.

---

### Big UX pass: sidebars, filters, view page, All Called polish, shared view (2026-04-10, session 2)

A long session reworking the left sidebar, top toolbar, filter system, ListView, shared view page, and All Called feature end-to-end. All changes verified in preview with 0 typecheck errors.

**Left sidebar (`Sidebar.svelte`):**
- **Cast/Team pill pair → single toggle button with down arrow.** One click flips between Cast and Team modes. Width is auto-sized to content.
- **Display mode 3-pill row → single dropdown button + floating menu.** Button shows the current mode label ("ACTOR", "CHARACTER", "BOTH" for cast; "NAME", "ROLE", "BOTH" for crew). Click opens a `<ul role="listbox">` menu, click-outside closes, switching views via the Cast/Team toggle auto-closes.
- **Collapse button.** Inline with the Cast/Team toggle, material-symbol `arrow_circle_right` icon. Click collapses the sidebar to a 32px strip with only the button visible (teal-highlighted when collapsed). Click again to expand. `sidebarCollapsed` state in `+page.svelte` drives the grid column width.
- **Sidebar width shrunk 240px → 210px → 180px** over multiple passes. Cast chips (max "Michael Thompson" at 162px) and crew role-mode chips fit; crew "both" mode truncates "Marcus Fight Choreographer" with ellipsis.
- **Whole header sticky.** The Cast/Team toggle + drag hint + mode dropdown now live in a `.sidebar-header` wrapper with `position: sticky; top: 0`. The chip list + groups section scroll below in a separate `.sidebar-scroll` div. So you can always reach the toolbar controls no matter how far you scroll. Sticky offset uses `--sticky-bar-height` from the existing ResizeObserver so it sits below the show-title sticky bar.
- **Cross-pool first-name disambiguation.** `packages/core/src/cast.ts` refactored: `castDisplayNames(cast, mode, crew?)` now takes crew as an optional arg and disambiguates across BOTH pools. New `crewFirstNameLabels(cast, crew)` returns crew labels the same way. Internal `buildFirstNameLabels(cast, crew)` does the work once and returns `{cast: Map, crew: Map}`. Callers updated: DayCell, ListView, Sidebar, ConflictSubmitter, view/+page. So if the cast has Marcus Chen and crew has Marcus Webb, both show as "Marcus C." / "Marcus W." in all grid/cell/sidebar contexts.
- **Cast chip in "Both" mode in cells: shows just the name** (CastChip already does this because compact=true hides the character line). Crew chip `crewChipLabel` in DayCell was updated: "name" and "both" both return just the disambiguated name; "role" returns the role. Matches cast behavior. Sidebar still shows name + role in "both" mode as Blake wanted.
- **All Called chip has edit/delete buttons** matching Montagues/Capulets. New settings fields `allCalledLabel?`, `allCalledColor?`, `allCalledVisible?`. Edit opens a form with label input, color picker (reuses CAST_COLOR_PALETTE), and a read-only cast member list with green checkmarks ("everyone is included" verification). Delete hides the chip (set `allCalledVisible: false`). Undo restores it.
- **All Called label + color propagates to cells.** Previously `.all-called-mini` in DayCell had hardcoded `background: #5b1a2b` and hardcoded "All Called" text. Now reads from `show.settings.allCalledLabel/Color` via derived values + `style:background`. Same fix in ListView (`.all-called-chip` restyled as a colored pill) and view/+page.svelte.
- **All Called tooltip** is now just `{label} ({N} members)` - matches the existing GroupChip pattern.
- **Edit forms → floating popovers.** Both the group edit form and the new All Called edit form are now `position: fixed` popovers positioned near the click event via `formPopoverPos`. `capturePopoverPos(e)` reads the clicked button's bounding rect and clamps to keep the popover on-screen (flips above if insufficient room below, clamps horizontally). Backdrop handles click-outside close. Escape also closes via `handleWindowKey`. No more inline form expansion that shifted the sidebar.
- **Delete confirmation dialog.** New `pendingDelete` state + modal dialog shared between groups and All Called. Shows "Delete {name}?" with context-specific message ("removed from every day it's called on" for groups, "you'll need to add a new group manually" for All Called). Cancel / red Delete buttons. Matches app styling.

**Top toolbar (`+page.svelte`):**
- **Calendar/List two buttons → single view toggle.** Shows icon of the CURRENT view, click flips.
- **"All" scope option renamed to "Overview"** (in dropdown, button title, and toolbar label).
- **Filter button is now icon-only** (no `"May 4 - Jun 14"` date range text). Clicking opens a unified dropdown with 4 sections.
- **Unified filter dropdown** with collapsible sections:
  - **Date range** - existing From/To inputs
  - **Person** - multi-select checkboxes for cast (dots) + crew (squares), scrollable list
  - **Event type** - multi-select with event type colors
  - **Location** - multi-select from `locationPresetsV2`
  - Each section has a chevron that rotates 90° when expanded, per-section Clear button, and "Clear all" in the header
  - Sections auto-expand on open if they have an active filter (via `$effect` watching `dateFilterOpen`)
  - All four are independent - multiple can be expanded at once
- **Filter semantics:** new derived `filterExcludedDates: Set<string>` computed in +page.svelte. For each date, checks person/event-type/location filters: person (day must have at least one selected person called directly/via group/via allCalled); event type (day's `eventTypeId` must be selected); location (at least one call at a selected location). Passed to CalendarGrid + ListView as `excludedDates` prop. Date range filter stays as `filterStart/filterEnd` for backwards compat. Both props combine at render time - a cell is filtered out if EITHER excludes it. `hasAnyFilter` drives the teal filter-active icon state.
- **Toolbar text labels** new `Settings.showToolbarLabels?: boolean`. When on, every toolbar button shows its label next to the icon ("Calendar", "Prev", "Overview", "Next", "Filter", "Undo", "Redo", "Settings", "Export", "Collect", "Share", "Save"). New `.toolbar-btn-labeled` CSS modifier: width:auto, padding, gap. Scope button's label is dynamic based on `scopeMode`. Toggle lives in DefaultsModal Appearance tab visibility-toggles row.

**ListView improvements:**
- **Shows all dates by default** (blank days included). Previously skipped days with no calls/description/notes. New `EMPTY_DAY` placeholder for dates with no schedule entry so the template renders uniformly.
- **Blank days dimmed to 55% opacity** with reduced padding via `.list-day.blank`. Hover restores full opacity.
- **`Settings.hideBlankListDays?: boolean`** - when on, blank days are hidden (old behavior). Toggle in Appearance settings.
- **Smart blank detection:** a day counts as blank only when it has NO event type AND no calls AND no description AND no notes. Dark days (event type only) still appear even when the setting is on.

**Conflict collection (UI → backend polish):**
- **Toolbar icon turns teal when there are pending submissions.** New `pendingConflictCount` state in +page.svelte with `onMount` reading localStorage + `storage` event listener. `class:needs-attention` matches the Share button pattern. Tooltip shows `"Collect conflicts (N pending)"` when > 0.
- **Conflict lockout date setting.** New `Settings.conflictLockoutDate?: string`. In ConflictRequestModal, added toggle "Lock edits after a deadline" + date picker that defaults to 7 days out. New `onchangelockout` prop wires to `updateSettings`. Defaults assigned to `settings.conflictLockoutDate` via +page.svelte.
- **ConflictSubmitter respects lockout.** Derived `lockoutDate` and `isLocked` (`todayLocalIso() > lockoutDate`). When not locked but with deadline set: teal banner "You can add or edit your conflicts through {date}". When locked: amber banner "The deadline to submit conflicts has passed", instructions/submit/add-timed hidden, cells disabled (`cal-cell.locked` class, no click handlers, no hover transform). Existing submissions still render as read-only.
- **Per-actor mode renamed "One per role"** + includes production team. Modal shows two groups (Cast / Production Team) with per-person copy buttons. "Copy all" writes labeled lists for both groups. Single-link mode's dropdown on the actor-facing page also has cast + crew optgroups.
- **`ConflictSubmitter` Member union type.** `type Member = CastMember | CrewMember` + `subtitleFor(m)` returning character/role. `selectedActor` derived searches both arrays.
- **Per-role route** matches id prefix in both cast and crew arrays. Error message says "anyone in the cast or production team" instead of just "cast".
- **Empty-cast guard** now allows cast OR crew (not just cast). Toast: "Add cast or crew to use this".
- **Toolbar tooltip dropped "from actors"** - just "Collect conflicts" now.

**Public shared view page (`(view)/view/+page.svelte`):**
- **Cast + Team + individual filter dropdown.** Shows "Everyone" + optgroup "Cast" (with "All Cast" + each cast member with character) + optgroup "Production Team" (with "All Team" + each crew member with role). Filter values: `""`, `"cast:all"`, `"team:all"`, or individual member id.
- **`calledDates` logic handles all 4 cases.** `isCastId()` / `isCrewId()` helpers route by id. For `"cast:all"` matches any cast member called. For `"team:all"` matches via `calledCrewIds`. Individuals use existing logic (with `calledCrewIds` added for crew).
- **Calendar / List view toggle** - pair of plum/muted buttons styled like the old main-toolbar active state. Click to switch. List view is a new vertical layout that respects the filter (called days get teal left border + light teal background, uncalled dimmed to 35%). Reuses same event type badges, chips, allCalled color, and displayNames as the calendar view.
- **Group chip colors fixed.** View page was using hardcoded `#6a1b9a` fallback so both Montagues and Capulets rendered purple. Now uses `g.color ?? locationColor(g.id) ?? '#6a1b9a'` matching the `GroupChip.svelte` component's fallback chain, so groups without explicit color get deterministic hash-based colors (Montagues → orange, Capulets → purple).

**Demo page banners:**
- **Top banner: buy button removed.** Since "Buy Now" is already in the nav header directly above the banner, the duplicate was redundant.
- **Bottom banner added.** Same message as top + Buy button. Sits after the scheduler grid so users finishing their tour can purchase without scrolling back up. Button text is just "Buy Rehearsal Block" (no "- $50") - pricing is centralized on the `/buy` purchase page.
- **Publish flow: first-publish keeps dropdown open.** `publish()` tracks `wasFirstPublish = !shareId` before calling the API. On first publish, keeps dropdown open and sets `justFirstPublished = true` which adds a `highlighted` class to the Copy Link button (teal background, teal left border, 2-iteration pulse animation) so users discover the Copy Link action. Subsequent republishes close the dropdown as before. Highlight clears when dropdown closes (via `$effect`).

**Settings fields added this session:**
- `conflictLockoutDate?: string`
- `allCalledLabel?: string`, `allCalledColor?: string`, `allCalledVisible?: boolean`
- `showToolbarLabels?: boolean`
- `hideBlankListDays?: boolean`

**Files touched:**
- `packages/core/src/types.ts` - Settings additions
- `packages/core/src/cast.ts` - cross-pool disambiguation helpers
- `packages/standalone/src/lib/components/scheduler/Sidebar.svelte` - collapse, sticky header, All Called edit/delete, floating popovers, delete confirmation
- `packages/standalone/src/lib/components/scheduler/DayCell.svelte` - All Called color/label propagation, crewChipLabel simplification, crewFirstNameLabels
- `packages/standalone/src/lib/components/scheduler/ListView.svelte` - blank days support, `excludedDates` prop, All Called color/label
- `packages/standalone/src/lib/components/scheduler/CalendarGrid.svelte` - `excludedDates` prop, integrates with existing filterStart/filterEnd
- `packages/standalone/src/lib/components/scheduler/ConflictRequestModal.svelte` - lockout UI, per-role crew inclusion, Cast/Team hint text
- `packages/standalone/src/lib/components/scheduler/ConflictSubmitter.svelte` - crew in dropdown, lockout state + banners + locked cells, Member union type
- `packages/standalone/src/lib/components/scheduler/DefaultsModal.svelte` - toolbar labels toggle, hide blank days toggle
- `packages/standalone/src/routes/demo/+page.svelte` - filter state/logic/dropdown, view toggle, toolbar labels, All Called handler, pending conflict count, publish flow highlight, bottom banner
- `packages/standalone/src/routes/+layout.svelte` - isPublicPage (renamed from isViewRoute) matches /view AND /conflicts
- `packages/standalone/src/routes/(view)/view/+page.svelte` - cast+team+individual filter, calendar/list toggle, group color fallback, list view rendering
- `packages/standalone/src/routes/conflicts/[token]/+page.svelte` and `[actorId]/+page.svelte` - existed before this session but updated per-role routes to match both arrays

---

### Actor-facing conflict submission pages + localStorage end-to-end (2026-04-10)

Completed the conflict collection feature so it's fully testable locally before the Supabase backend lands. The pattern: use localStorage as a "poor man's Supabase" scoped by token so the flow works exactly as it will in production, just client-side only (same browser required for local testing).

**New files:**
- `packages/standalone/src/lib/components/scheduler/ConflictSubmitter.svelte` - actor-facing calendar + submit form. Modeled on `ActorConflictPicker.svelte` (the existing picker in DefaultsModal > Contacts) but as a full page instead of a modal, with larger touch-friendly cells (44px min), actor identification step, batch staging of conflicts with submit button, post-submit confirmation screen, and return-visit loading from localStorage.
- `packages/standalone/src/routes/conflicts/[token]/+page.svelte` - single-link mode route with cast dropdown selector
- `packages/standalone/src/routes/conflicts/[token]/[actorId]/+page.svelte` - per-actor route that matches the cast member by id-prefix and pre-selects them
- `packages/standalone/src/routes/conflicts/[token]/+page.ts` and `[actorId]/+page.ts` - both set `ssr = false` since data is client-only (localStorage-backed)

**Interaction model:**
- **Click** a date → adds a full-day conflict
- **Click** an existing conflict → shows inline Edit / Remove action row
- **Ctrl+Click** / **Cmd+Click** a date → opens a timed conflict modal (desktop shortcut)
- **"+ Add timed conflict" button** → opens the same timed-conflict modal with a native `<input type="date">` picker (mobile-friendly primary path since Ctrl doesn't exist on phones)
- On mobile (<= 520px), the "Add timed conflict" button stretches full-width and the page/cal padding tightens

**localStorage keys:**
- `rehearsal-block:conflict-show:{token}` - snapshotted ScheduleDoc (written by ConflictRequestModal via `$effect` whenever the show prop changes, so the actor-facing page always has current cast and dates)
- `rehearsal-block:conflict-submissions:{token}` - array of Submission objects

**Submission shape:**
```ts
type Submission = {
  id: string;
  actorId: string;
  actorName: string;
  conflicts: Conflict[];
  submittedAt: string; // ISO
};
```

**ConflictRequestModal updates:**
- Writes show snapshot to localStorage on mount and on every show change (via `$effect`) so the actor-facing page can always load the current state
- Reads submissions from localStorage on mount, refreshes via `storage` event listener (fires when submissions come in from other tabs)
- New `onacceptconflicts?: (conflicts: Conflict[]) => void` prop - called with the submission's conflicts when director clicks Accept
- Accept removes the submission from localStorage (inbox pattern, not archive), auto-switches back to Generate Links tab when inbox is empty
- Reject just removes without forwarding the conflicts
- Pending tab renders real submissions with Accept/Reject buttons, shows actor name, conflict count, submitted time, and a list of each conflict (dates + times + labels)

**Demo page (`+page.svelte`) updates:**
- `openConflictRequest()` - toolbar button click handler. If `doc.cast.length === 0`, calls `showToast("Add actors to use this")` and returns. Otherwise opens the modal.
- `acceptConflictSubmission(conflicts)` - pushes the submitted conflicts into `doc.conflicts` with undo support. De-dupes against existing conflicts by `actorId + date + startTime + endTime` composite key so resubmissions don't create duplicates.
- The DefaultsModal secondary entry (`oncollectconflicts`) also checks `cast.length === 0` and shows the same toast

**Empty-cast guard (Blake's requirement):** the toolbar button always looks clickable; on click if cast is empty, shows a toast "Add actors to use this" instead of opening the modal. Same for the Contacts > Cast secondary entry. No in-modal warning banner, no disabled state - simpler pattern.

**Layout shared-chrome hiding:** `packages/standalone/src/routes/+layout.svelte` renamed `isViewRoute` to `isPublicPage` and matches both `/view` and `/conflicts` prefixes, so the actor-facing page has no header/footer and renders on its own minimal layout.

**Verified end-to-end in preview:**
1. Click toolbar button → modal opens, show snapshot written to localStorage
2. Copy link → navigate to /conflicts/{token} → calendar renders with show dates
3. Select actor from dropdown → instructions + add-timed button appear
4. Click 3 dates → conflict-item rows appear below calendar
5. Ctrl+Click a date → timed conflict modal opens
6. Submit → confirmation screen, submission persisted
7. Navigate back to /demo → open modal → Pending tab shows "Pending 1" badge with full submission details
8. Click Accept → submission removed, conflicts merged into doc (verified via Contacts > Cast showing Marcus "3 conflicts")
9. Per-actor mode: navigate to /conflicts/{token}/{actorId} → Marcus pre-selected with personalized "Hi, Marcus!" card, no dropdown
10. Return visit: reload an actor page with a pending submission → stagedConflicts loaded from localStorage so actor can edit
11. Mobile (375px): cells resize to 44px touch targets, Add timed button stretches full-width, page padding tightens
12. Empty-cast guard: code path in place (clicking the button when `doc.cast.length === 0` shows a toast)

**Caveat for local testing**: localStorage is per-browser-origin, so you can't test cross-device. Opening the link in a different browser or on a phone won't find the show snapshot. That's fine for local dev - Blake just needs to open the link in a new tab in the same browser to simulate an actor. In production (Priority 2), this gets replaced with a Supabase lookup by `conflict_share_token`, which works across devices.

**Known demo quirk (not a bug):** the demo page uses in-memory state that resets on full page navigation. If you navigate away from `/demo` and back using the same tab, previously-accepted conflicts disappear because the sample show re-initializes. In production the doc will be persisted to Supabase and this won't happen. For a clean test of the accept flow, stay on `/demo` and open actor links in new browser tabs instead of navigating the same tab.

---

### Conflict collection UI + paid version architecture decisions (2026-04-10)

**Conflict Request Modal (UI only, backend stubbed for Priority 2):**
- New file: `packages/standalone/src/lib/components/scheduler/ConflictRequestModal.svelte`
- Two-tab layout (Generate Links / Pending), standard modal pattern matching ContactSheetModal
- **Generate tab**: toggle between "Single link" (one URL for whole cast, actors pick name from dropdown on the actor-facing page) and "One per actor" (8 unique URLs with individual Copy buttons + "Copy all" button that copies `Name: URL` lines)
- **Pending tab**: empty state now, will be wired to real submissions in Priority 2
- Deterministic placeholder tokens via `hashString(show.name + startDate)` - demo mode note in modal explains it's stubbed
- Per-actor links are derived as `{showToken}/{castMemberIdSlice}` - intentionally NOT stored as separate DB rows (design decision, see PRODUCT_SPEC.md)

**Hybrid entry-point pattern:**
- **Primary (toolbar)**: new icon button between Export and Share in `packages/standalone/src/routes/demo/+page.svelte`. Icon is Material Symbol `event_available` (calendar with checkmark). State: `conflictRequestOpen`.
- **Secondary (workflow-area)**: new `oncollectconflicts` prop on DefaultsModal. Button appears in `DefaultsModal.svelte` Contacts > Cast section header next to Import CSV / + Add actor. Clicking it closes DefaultsModal and opens ConflictRequestModal via `defaultsOpen = false; conflictRequestOpen = true;`.
- This hybrid pattern is the preferred approach for rarely-used features (see feedback memory `feedback_secondary_entry_points.md`). Blake mentioned wanting to apply the same pattern to other features like Export Contact Sheet.

**Paid version architecture decisions (captured in PRODUCT_SPEC.md, no code yet):**
- **Local-first**: IndexedDB is the source of truth, Supabase is a debounced sync layer, not a backend. Main benefits: offline-capable, bandwidth-efficient, instant app open, resilient to Supabase outages. The localStorage and Supabase storage stubs (`lib/storage/local.ts` and `lib/storage/supabase.ts`) are where this gets implemented in Priority 2.
- **Last-write-wins** for multi-device conflict resolution (not per-field merging, not CRDTs). Fine for single-user product.
- **Supabase Pro ($25/mo) from day one**, not Free. Free tier pauses after 7 days of inactivity and requires MANUAL dashboard restore (NOT auto-resume on access - common misconception, official docs are vague). Break-even on Pro = 6-8 sales/year.
- **Conflict submissions as inbox pattern**: when director accepts, conflicts merge into `shows.document.conflicts` AND the `conflict_submissions` row is deleted in the same transaction. Data lives in one place at a time. Optional 30-90 day sweep of applied rows if audit trail desired.
- **Supabase keepalive pings**: UptimeRobot (primary, with email alerts) + GitHub Actions (backup, cron every 3 days). Both hit a new `/api/healthcheck` endpoint that does a trivial Supabase query. Do NOT run keepalive from Blake's home/work computers - hardware sleep, restarts, and vacation absences kill local crons.

**Files changed:**
- `packages/standalone/src/lib/components/scheduler/ConflictRequestModal.svelte` (new)
- `packages/standalone/src/routes/demo/+page.svelte` (import, state, toolbar button, modal render, DefaultsModal oncollectconflicts prop)
- `packages/standalone/src/lib/components/scheduler/DefaultsModal.svelte` (oncollectconflicts prop + secondary entry button in Cast section header)
- `PRODUCT_SPEC.md` (expanded architecture section with local-first, pause gotcha, cost math, keepalive plan, conflict collection design; expanded Priority 2 with sync layer foundation work)

### CSV import, phone formatting, and group expand/collapse fixes (2026-04-09)

**CSV Import for Cast and Crew** (Settings > Contacts > Cast / Production Team):
- "Import CSV" button next to "+ Add actor" / "+ Add member" in each tab
- File picker (`.csv` only) opens a **column-mapping UI** replacing the card list
- Each CSV column gets a dropdown to map to a field (First Name, Last Name, Character/Role, Pronouns, Email, Phone, Middle Name, Suffix, or Skip)
- **Auto-detection**: common header names ("First Name", "fname", "Role", "Position", etc.) pre-map automatically
- **Headerless CSV support**: if no column matches a known header, all rows are kept as data with generic "Column 1", "Column 2" labels for manual mapping
- **Preview table** shows first 5 mapped rows
- **3 import modes** (radio buttons):
  - Add new only (default) - skip rows matching existing members by name
  - Merge (fill blanks) - match by name, fill empty fields, add new
  - Merge (overwrite) - match by name, overwrite with CSV values, add new
- **Result summary banner** after import shows: new members added, existing members updated (listing which fields changed per person, e.g. "Sam O'Brien: Pronouns, Email"), rows skipped
- Name matching is case-insensitive `firstName + lastName`

**Files for CSV import**:
- `packages/core/src/csv-import.ts` - **new** - CSV parser, `CastField`/`CrewField` types, `CAST_FIELD_LABELS`/`CREW_FIELD_LABELS`, `autoMapColumns`/`autoMapCrewColumns`, `mapRowsToCast`/`mapRowsToCrew`, `mergeCastImport`/`mergeCrewImport`, `ImportMode`, `ImportResult<T>`
- `packages/core/src/index.ts` - re-exports csv-import
- `packages/standalone/src/lib/components/scheduler/DefaultsModal.svelte` - import UI for both cast and crew tabs, `onimportcast`/`onimportcrew` props
- `packages/standalone/src/routes/demo/+page.svelte` - `importCast`/`importCrew` handlers

**Phone number formatting**:
- `formatPhone(raw)` in `packages/core/src/cast.ts` - strips non-digits, formats 10-digit numbers as `XXX-XXX-XXXX`, handles 11-digit with leading 1
- Applied on blur for both cast and crew phone inputs in DefaultsModal
- Applied during CSV import (`mapRowsToCast`/`mapRowsToCrew`)

**Expand/Collapse Groups fix** (Settings > Schedule):
- "Expand Groups Into Actors" now handles `allCalled` - adds all cast member IDs and sets `allCalled: false`
- "Collapse Actors Into Groups" now detects when all cast members are present and sets `allCalled: true` (previously collapsed to Montagues + Capulets + leftover actors)

**Contacts tab keyboard shortcut fix**:
- Shift+< / Shift+> now works immediately when clicking the Contacts tab or switching subtabs (previously required clicking a card first)
- Cast and crew `<section>` elements have `tabindex="-1"` with `outline: none`, auto-focused via `queueMicrotask` on tab/subtab click



### Landing page redesign + footer (2026-04-10)

Complete rewrite of the landing page (`packages/standalone/src/routes/+page.svelte`) and footer updates in `+layout.svelte`.

**Font change**: `--font-display` in `theme.css` changed from `"Playfair Display", Georgia, ...` (serif) to `"Jost", "Century Gothic", "Futura", ...` (geometric sans-serif). Jost is a free Google Font that matches Blake's preferred Century Gothic aesthetic. Loaded globally via `app.html` alongside Inter. The old Playfair Display was just a user-selectable calendar font, not the brand choice.

**Landing page structure** (all in `+page.svelte`):
- **Hero section**: two-column split (copy left, faux calendar preview right). The hero is wrapped in a `.hero-pin` container with `position: sticky` for a scroll-driven animation. The app header is also made sticky on the landing page only (via `body.landing-page` class toggled by `$effect`).
- **Cast chip reel**: horizontal band of 8 color-coded chips with staggered float-in animations.
- **3 feature rows**: alternating copy/mockup layout. Row 1 = month view mockup (matches real Month scope with cells, badges, chips). Row 2 = cast sidebar mockup with conflict warning. Row 3 = share-link mockup (browser chrome, filter dropdown, "8 days called" pill, filtered calendar grid with teal left-border highlighting).
- **Closing CTA**: plum-dark band with teal spotlight glow.

**Scroll-driven hero animation** (the most complex part):
- Pin container height = `calc(100vh + 488px)` giving a pin range of ~600px (hero unpins at scroll 6).
- Animation timeline is a FIXED 1400px, decoupled from pin range. `progress = scrollY / 1400` drives stages.
- Two flying chips: Marcus (blue, drags from left gap into MON) and Sam (orange, drags from right gap into THU). Each uses CSS custom properties (`--chip-drag`, `--chip-opacity`, `--chip2-drag`, `--chip2-opacity`) interpolated continuously from `progress` for smooth drag motion.
- 11 discrete stages via `STAGE_THRESHOLDS` array. Cumulative `.s1` through `.s11` classes control element visibility via CSS transitions.
- Day layout: MON (4) animates stages 3-8, TUE (5) DARK at stage 4, WED (6) pre-filled, THU (7) animates stages 7-11 (lagging behind MON), FRI (8) pre-filled.
- MON fully built by scroll 7 (stage 8 = location pill). Pin releases at scroll 6. THU keeps building stages 9-11 while the hero scrolls away naturally. Page starts moving at scroll 6, THU's last element (location pill) appears at scroll ~1274px.
- Mobile: pin disabled (`height: auto`, `position: static`), all stages forced to 11, flying chips hidden.

**Sticky header behavior**: the app header becomes `position: sticky; top: 0` only on the landing page, via a CSS rule `:global(body.landing-page .app-header)`. A `$effect` in `+page.svelte` adds/removes `landing-page` on `document.body` on mount/unmount. When the pin releases (scroll >= pinReleaseScrollY), a second class `landing-header-unstuck` is added which sets `position: static`, so the header scrolls away with the hero.

**Footer** (`+layout.svelte`):
- Three-column CSS grid: BRY Theatrics brand (left), contact (center), copyright (right). Mobile stacks to single column.
- BRY Theatrics logo swapped from PNG to white SVG (`bry-theatrics-logo-white.svg`, copied from `My Drive/Logos/BRY Theatrics/`).
- Contact link: `mailto:hello@rehearsalblock.com`. Requires Chrome's protocol handler to be registered for Gmail (see below). On click, also copies email to clipboard and shows a "Copied to clipboard" teal pill toast above the link (auto-hides after 2.2s). The clipboard copy is a fire-and-forget `navigator.clipboard.writeText()` that doesn't call `preventDefault()`, so the mailto: default action still fires.
- **Chrome mailto handler setup**: Go to `mail.google.com`, open devtools, run `navigator.registerProtocolHandler("mailto", "https://mail.google.com/mail/?extsrc=mailto&url=%s", "Gmail")`, click Allow. Verify at `chrome://settings/handlers`. This is fragile and can silently break - if mailto stops working, re-register. The clipboard fallback ensures users without a handler still get something useful.

**Bug fix**: DefaultsModal crew color popover click-outside wasn't closing (only cast popover was). Added `if (crewColorPopoverFor) crewColorPopoverFor = null;` to the modal-body onclick handler.

**Files changed**:
- `packages/standalone/src/app.html` - Google Fonts link (Jost + Inter)
- `packages/standalone/src/lib/theme.css` - `--font-display` changed to Jost
- `packages/standalone/src/routes/+page.svelte` - full rewrite (landing page)
- `packages/standalone/src/routes/+layout.svelte` - footer contact link, white SVG logo, grid layout, clipboard copy handler
- `packages/standalone/static/bry-theatrics-logo-white.svg` - new file
- `packages/standalone/src/lib/components/scheduler/DefaultsModal.svelte` - crew color popover fix

### Contact Sheet polish (2026-04-10)
Follow-ups to the rewrite above:
- **Column order**: Name, Character, Pronouns, Phone, Email (was Name, Pronouns, Character, Phone, Email). Pronouns column narrowed; Phone and Email widened.
- **Font**: all 10pt data/section text reduced to 9.5pt in both PDF and DOCX.
- **DOCX margins**: 1 inch default → 0.5 inch all sides (720 DXA). Content area is now 10800 DXA.
- **Colors**: header underline #1a1a1a → #9ca3af, row divider #9ca3af → #d8d9db (both formats). In `export-docx.ts` the header rule previously reused `COLOR_TEXT`; there's now a dedicated `COLOR_RULE_HEADER` constant.
- **Subtitle date format**: ISO (`2026-05-04 - 2026-06-14`) → US text (`May 4, 2026 - Jun 14, 2026`) via new `formatUsDate(iso)` helper in `packages/core/src/dates.ts`. Uses `Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })`.
- **PDF row text vertical centering**: text was sitting high in each row because pdfkit positions text by the em-box top and Helvetica's glyph mass is biased low. Fixed with a +0.75pt empirical nudge on `textY` (see "Row text vertical centering" below).
- **Debug**: added `_render-pdf.mts` (pdfjs-dist + @napi-rs/canvas high-DPI renderer) to enable precise pixel-level verification of line positions and text centering. Made `debug-contact-docx.mts` self-contained (no longer depends on a removed `_tmp-chrome-view.mts`).

### Completed this session (2026-04-08/09)
- **Favicon**: SVG + PNG favicons added from `OneDrive/Desktop/Logos/Rehearsal Block/`. Logo re-exported with outlined text (Type > Create Outlines in Illustrator) so it renders without Century Gothic Pro installed
- **Conflict icons**: Replaced `🚫` emoji with inline SVG across DayCell, ListView, DayEditor (emoji rendered differently per OS)
- **Default event type**: Star selector in DefaultsModal Event Types tab, applies to new days, respects defaults-assigned dates
- **Event type badge hiding**: Defaults-assigned dates don't show badge until real content added
- **Event Types & Locations tabs**: Refreshed from boxy cards to flat rows with bottom borders, SVG icons (calendar_month, close), circular color swatches, subtle remove buttons. Style pattern came from wanting it to feel less "dated"
- **Contacts tab FULL REDESIGN**: Replaced spreadsheet layout with card-based layout in both Cast and Production Team sub-tabs
  - Expandable cards: color dot, full name + pronouns pill + character/role + conflict count pill
  - Expanded shows First/Middle/Last/Suffix in row, then Pronouns/Email/Phone, then Character/Role, then conflicts with X delete, then Add conflicts / Remove actor buttons
  - Collapse All / Expand All buttons with Shift+< / Shift+> hotkeys (uses Set<string> state)
  - Reorder arrows on left of cards (hidden until hover)
  - Color dot is a button that opens the existing color popover (restructured to avoid `<button>` inside `<button>`)
  - All existing functionality preserved: color picker, name editing, reorder, remove with confirmation, conflict list, ActorConflictPicker
  - Mockup tab was used to prototype the design first, then removed
- **Holidays feature**: New `packages/core/src/holidays.ts` with US federal holidays (11 holidays: New Year, MLK, Presidents, Memorial, Juneteenth, July 4, Labor, Columbus, Veterans, Thanksgiving, Christmas). Custom holidays supported. Toggles for each holiday individually (`hiddenHolidays` array). Amber badge renders below day number in DayCell (not in badge-group). Settings UI in Schedule tab of DefaultsModal
- **Contact Sheet Export**: 3 formats - CSV, DOCX, PDF
  - "Export Contact Sheet" item in export dropdown (below Export CSV)
  - `ContactSheetModal.svelte` with Cast/Crew include toggles and CSV/DOCX/PDF format toggles
  - **CSV**: `buildContactSheetCsv()` in core/export.ts - single header row, cast then crew, no section labels
  - **DOCX**: `buildContactSheetDocx()` in `packages/standalone/src/lib/export-docx.ts` using `docx` package. Visual design matches the PDF (Georgia title, muted subtitle, uppercase section headers, table with no outer borders, #9ca3af header rule, #d8d9db row rules, 9.5pt data font, 0.5 inch page margins). Word's automatic table pagination handles overflow and repeats column headers.
  - **PDF**: rewritten this session - now uses `pdfkit` (server-side, pure Node) via new `/api/contact-sheet-pdf` endpoint. See "Contact Sheet PDF rewrite" below.

### Contact Sheet PDF rewrite (2026-04-09)
Replaced the original HTML -> Puppeteer pipeline with a `pdfkit` renderer that draws to exact coordinates. This fixed the inconsistent line-thickness bug (CSS borders sub-pixel rasterizing at different integer Y positions) by using vector line primitives instead of CSS borders.

**Architecture**:
- `packages/standalone/src/lib/contact-sheet-pdf.ts` - `renderContactSheetPdf(doc, opts)` returns `Promise<Uint8Array>`. Pure Node, no Chromium needed. Manual pagination - tracks Y cursor, adds page when next row would overflow, redraws "(continued)" section heading + column header row at top of each new page.
- `packages/standalone/src/routes/api/contact-sheet-pdf/+server.ts` - POST endpoint accepting `{doc, includeCast, includeCrew, filename}`. Calls the renderer and returns PDF bytes.
- `ContactSheetModal.svelte` POSTs to `/api/contact-sheet-pdf` for PDF, no longer uses `/api/pdf` (which is still used by the calendar export).

**Why pdfkit over Puppeteer for this**: vector line drawing eliminates the sub-pixel rasterization issue, no Chromium memory overhead (won't hit Netlify's 1024MB limit), much smaller PDF output (~3KB vs ~65KB), faster cold start.

**Layout** (see top of contact-sheet-pdf.ts for constants): Letter portrait, 40pt margins, Times-Bold 24pt title, Helvetica 11pt subtitle, Helvetica-Bold 9.5pt section headings, 5 columns at 21/21/12/17/29% (Name/Character-or-Role/Pronouns/Phone/Email). Pronouns slice is sized so the "PRONOUNS" column header fits; Phone is sized for "(253) 202-6194". Header rule 1.25pt #9ca3af, row rules 0.5pt #d8d9db. 9.5pt data font. Subtitle shows "May 4, 2026 - Jun 14, 2026" via `formatUsDate()` from core/dates.ts. Long text truncates with ellipsis (`lineBreak: false, ellipsis: true`).

**Row text vertical centering**: pdfkit places the top of the em-box at the given y, but Helvetica's visible glyph mass is biased below that (short descenders, tall ascenders), so a naive `(rowHeight - fontSize)/2` formula lands text too high. Empirical offset of `+0.75pt` puts the x-height midpoint on the row's vertical center. Don't "simplify" this back.

**Debug harness** lives in `packages/standalone/scripts/`:
- `debug-contact-pdf.mts [small|large]` - generates a PDF and screenshots each page using Chrome's built-in PDF viewer. Good for human-readable previews since Chrome renders the standard-14 PDF fonts correctly.
- `debug-contact-docx.mts [small|large]` - generates a .docx, converts to PDF via Word COM automation (PowerShell), then screenshots each page via Chrome (all inline in the script).
- `_render-pdf.mts <pdfPath> <pngPath> [scale] [cropX cropY cropW cropH]` - alternate renderer using pdfjs-dist + @napi-rs/canvas. Glyph letter spacing looks broken in Node (standard-14 font substitution, see below) but layout is pixel-accurate, so this is the right tool for **precise inspection of line positions, text centering, or exact pixel measurements**. Supports arbitrary scale (6x and 8x are useful) and an optional tight crop. Used to verify the +0.75pt textY fix.
- `_zoom.mts` - Chrome-based full-page zoom screenshot (less precise, mostly superseded by `_render-pdf.mts`).
- Output goes to `scripts/out/` which is gitignored.
- Run via: `cd packages/standalone && pnpm exec tsx scripts/debug-contact-pdf.mts large`

**Why standard PDF font rendering looks broken in Node**: pdfkit uses standard-14 PDF fonts (Times, Helvetica, etc.) by default, which are *references* to fonts the viewer is expected to provide. pdfjs-dist in Node has no system fonts and falls back to a substitute that renders text with weird inter-character gaps ("R omeo" instead of "Romeo"). Real PDF viewers (Chrome, Adobe, Preview) handle these correctly. **The PDF itself is correct - only Node-side rendering is broken**. For human-readable screenshots, use the Chrome-based `debug-contact-pdf.mts`. For **layout-accurate pixel inspection** (where broken glyph spacing is acceptable), use `_render-pdf.mts`. If TTF embedding is ever needed for full Node verification or for guaranteed visual fidelity across exotic viewers, embed via `pdf.font(ttfBuffer)` and bundle the font file.

**Files involved in the Contact Sheet feature**:
- `packages/core/src/export.ts` - `buildContactSheetCsv`, `downloadContactSheetCsv`, `ContactSheetOptions` interface
- `packages/standalone/src/lib/contact-sheet-pdf.ts` - pdfkit PDF renderer (server-side)
- `packages/standalone/src/lib/export-docx.ts` - DOCX builder
- `packages/standalone/src/lib/components/scheduler/ContactSheetModal.svelte` - modal UI
- `packages/standalone/src/routes/demo/+page.svelte` - dropdown item + modal rendering (state: `contactSheetOpen`)
- `packages/standalone/src/routes/api/contact-sheet-pdf/+server.ts` - pdfkit endpoint
- `packages/standalone/src/routes/api/pdf/+server.ts` - calendar Puppeteer endpoint (still used for calendar PDF)

---

## Archived: Mobile audit (2026-04-10)

Baseline audit taken the day before the Mobile Phase 1 pass above. Preserved here because it documents the pre-fix measurements and issue inventory. The `MOBILE_AUDIT.md` file at the repo root has been deleted - this section is the canonical archive.

Measurements taken at **iPhone SE (375x812)** unless noted.

### Summary (as of 2026-04-10)

The app was in better shape on mobile than expected. Three of the four key pages (`/`, `/view`, `/conflicts`) rendered without horizontal scroll at 375px. Only `/demo` had a hard blocker. The main issues were:

1. **`/demo` toolbar overflowed horizontally** - single biggest bug. Pushed the whole page to 599px wide at a 375px viewport.
2. **App header wrapped to 2 rows on mobile** (142px tall) - ate too much vertical space on every page.
3. **Calendar (month/week) views on `/demo` unusable at phone width** - the inner 7-day grid stayed 7 columns, each cell ~40px wide and 841px tall. List view was the only usable mode on phones.
4. **No mobile defaults** - the page opened in Calendar + Overview with both sidebars visible regardless of viewport.
5. **Em dash in landing page copy** - "The cast \u2014" violated project style.

### Per-page findings (pre-fix)

**Landing page (`/`)**: No horizontal overflow. Hero pin animation correctly disabled on mobile (`.hero-pin` switched from `sticky` to `relative`). Feature rows stacked to 1 column via existing media queries. Mostly good. Issues: app header wrapped to 142px tall; hero copy contained a literal em dash.

**Demo page (`/demo`)**: **Blocker: toolbar caused horizontal scroll.** The `.toolbar` element was 575px wide inside a 375px viewport. It had `flex-wrap: wrap` but its parent `.sticky-bar` gave it `flex: 0 0 auto` with no `min-width: 0`, so the toolbar took its content size (575px) instead of shrinking. 12 buttons on one row. `scrollWidth` = 599, `innerWidth` = 375, horizontal overflow = 224px.

Calendar grid unusable at phone width. Inside `.week`, the computed grid template was `39.875px 39.8875px ...` × 7. Each day cell was 40px wide by 841px tall. Content (event type, time, location, cast chips, description) stacked vertically in a 40px column.

Scheduler outer layout did collapse to 1 column on mobile - the 3-column `[left sidebar] [calendar] [right sidebar]` grid stacked into a single 312px column at mobile. Functional but reaching Cast/Team or the day-tool palette required scrolling past the entire calendar.

Other numbers at 375px: app header 142px tall, top purchase banner 89px tall, left sidebar 304x590, scheduler total 312x4293. No mobile defaults - page opened in Calendar view, Overview scope, both sidebars expanded.

**Shared view page (`/view`)**: already had 2 mobile breakpoints baked in - 768px for column-stacked header + smaller cells, 480px for calendar grid collapsing to 1 column with day-number prefix. Not live-tested at audit time.

**Conflicts submission page (`/conflicts/[token]`)**: already mobile-friendly. Viewport 375px, no horizontal overflow. Cell size 44x44px (touch target). 520px breakpoint from `ConflictSubmitter.svelte` widened the "Add timed conflict" button. One concern: 6-column week of 44px cells was ~264px wide, fit but felt tight.

### Toolbar button inventory (for the row-split fix)

12 buttons at 40px each, in DOM order. Planned mobile split: row 1 = first 7 (navigation/view controls), row 2 = last 5 (actions).

Row 1: View toggle, Previous, Scope, Next, Filter, Undo, Redo
Row 2: Default Settings, Export, Collect conflicts, Share, Save

### Existing mobile CSS as of 2026-04-10 (pre-fix, scattered)

- `DayEditor.svelte` - `.backdrop` was `display: none` on desktop, enabled via media query on mobile
- `ConflictSubmitter.svelte` - 520px breakpoint
- `view/+page.svelte` - 768px and 480px breakpoints
- Landing page `+page.svelte` - hero pin released, feature rows stacked
- No unified mobile strategy prior to that session

All five items in the audit's "Phase 1 scope" (toolbar row split, app header compact layout, mobile defaults with sticky prefs, em dash fix, `--host` in dev script) were completed in the 2026-04-11 session documented at the top of this file.
