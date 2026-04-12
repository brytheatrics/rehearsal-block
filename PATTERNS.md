# Rehearsal Block Implementation Patterns

Detailed implementation patterns and gotchas that Claude should read **only when touching the relevant area**. This file is not auto-loaded - it's a reference for when you're actively working on one of the sections below.

---

## PDF rendering (current server-side, being replaced)

**Read when**: touching `/api/pdf`, `ExportModal.svelte`, `pdf-templates.ts`, or the `buildPrintHtml` code path in `packages/core/src/export.ts`.

The current PDF pipeline is server-side Puppeteer via `/api/pdf/+server.ts`. It uses `headerTemplate` / `footerTemplate` for the show title (when "Title on all pages" is on) and footer logo / page numbers / date.

- Shared HTML template builders live in `packages/standalone/src/lib/pdf-templates.ts`. The same module is used by both the server endpoint AND the export modal preview iframe so they render identically.
- PDF scale slider works via regex rewrite of `font-size: Npx` in the embedded `<style>` (NOT via Puppeteer's `scale` option, which doesn't expand the bottom margin reservation, and NOT via CSS `zoom`, which interacts badly with `page-break-inside: avoid`).
- `.print-header h1/.dates` get explicitly restored to their original 22px/11px sizes after the regex rewrite so the show title at the top of page 1 stays unscaled.
- Header template MUST use system-ui / Georgia (no Google Fonts `<link>`) - Chrome's printToPDF runs the template in an isolated context that can't fetch external stylesheets, throws CDP errors.

**Being replaced** in Phase 6 of the paid version plan (`.claude/plans/curious-cuddling-moth.md`) with a client-side paged.js path, because Netlify Free has a 10s function timeout that kills Puppeteer. Do NOT delete `/api/pdf` until paged.js is proven against the demo show - it stays as a localhost-only dev tool.

**PDF debugging harness**: `packages/standalone/scripts/debug-calendar-pdf.mts` POSTs the demo show to `/api/pdf` with various scale + mode combinations and renders every page to PNG via pdfjs-dist + @napi-rs/canvas. Output goes to `scripts/out/`. Run via `pnpm --filter @rehearsal-block/standalone exec tsx scripts/debug-calendar-pdf.mts 100 150 200`.

---

## Popovers that need to escape overflow ancestors

**Read when**: building or touching any dropdown / popover / floating panel, especially inside `Sidebar.svelte` or anywhere with `overflow: hidden` + `position: sticky` in the ancestor chain.

The group color picker popover uses a `portalToBody` Svelte action (defined inline in `Sidebar.svelte`) that does `document.body.appendChild(node)` on mount. Without it, Chromium clips the popover even though it's `position: fixed` because of an `overflow: hidden + position: sticky` ancestor. This is a Chromium rendering quirk, not a Svelte issue.

**Rule**: any popover that needs to escape an `overflow: hidden` ancestor must be portaled to `<body>`. Use the same `portalToBody` action pattern.

---

## Chip text overflow fade gradient

**Read when**: touching cast/crew/group chips (`CastChip.svelte`, `GroupChip.svelte`, `fade-when-clipped.ts`) or adding new chip-like components that need overflow treatment.

Cast/crew/group chips use a `fadeWhenClipped` Svelte action at `packages/standalone/src/lib/fade-when-clipped.ts`. It watches text elements with `ResizeObserver` and toggles `is-overflowing` on the closest chip ancestor when the text is clipped.

CSS uses `:global(.is-overflowing)` to render a `::after` overlay (15px fade + 7px solid buffer = 22px total) only when the text is actually clipped. The chip's border, border-radius, and colored left stripe stay intact - only the inside text fades.

**Rule**: don't use simple `text-overflow: ellipsis` on chips - it clips the colored left stripe and looks bad. Use the `fadeWhenClipped` action pattern instead.

---

## Inline cell editing (delayed click + composedPath)

**Read when**: touching `DayCell.svelte`, `ListView.svelte`, `DayEditor.svelte`, or any window-level click / double-click handler.

Two interrelated patterns hold the inline editor together:

**1. Delayed single-click (250ms)**. DayCell and ListView use a 250ms delayed single-click. A double-click cancels the pending single-click to prevent the DayEditor from opening and shifting the grid layout. This is critical - without the delay, double-click-to-edit-inline also fires the single-click handler that opens DayEditor, and the grid reflows mid-interaction.

**2. `event.composedPath()` instead of `target.closest()`**. Svelte 5 can unmount clicked elements before events finish bubbling up to window-level handlers. By the time a window click handler runs, `event.target` may already be detached from the DOM, so `target.closest('.foo')` returns null incorrectly. Use `event.composedPath()` which captures the path at event dispatch time, not at handler execution time.

**Rule**: any window-level click / dblclick handler MUST use `event.composedPath()`. Any cell that accepts both single-click and double-click interactions MUST use the 250ms delayed single-click pattern.

---

## Mobile architecture detail

**Read when**: touching mobile-responsive CSS, the hamburger menu, sticky toolbar, or dropdown bottom sheet patterns.

- **Default mobile breakpoint**: `@media (max-width: 768px)`
- **Mobile defaults** stored in `localStorage` as `rehearsal-block:mobile-prefs` (sticky preferences). On first mobile visit: list view, both sidebars collapsed, scope = Overview. Subsequent visits remember the user's choices. A `mobilePrefsHydrated` flag guards the persistence `$effect` so the initial default-value read doesn't overwrite stored prefs before `onMount` loads them.
- **Mobile header**: hamburger dropdown. Logo + hamburger button in a single 56px row. Tapping the hamburger drops a nav panel down (Demo / Sign In / Buy Now stacked). Click outside or Escape closes. Brand logo capped to `height: 32px; max-width: 180px` on mobile.
- **Mobile toolbar**: 12 buttons wrap 7+5. Row 1 = view toggle, prev, scope, next, filter, undo, redo. Row 2 = settings, export, collect, share, save, forced onto its own row via `flex-basis: 100%` on `:nth-child(5)`.
- **Sticky toolbar via `display: contents`**. At mobile width, `.sticky-bar` uses `display: contents` so its children (`.show-title-line` and `.toolbar`) become direct layout children of `.demo-inner`. The toolbar then uses `position: sticky; top: 0` with the full page as its containing block. Result: the title scrolls away, the toolbar stays pinned. Toolbar background spans edge-to-edge via negative margins matching the container's horizontal padding.
- **Toolbar dropdowns → bottom sheets on mobile**. Scope / Filter / Export / Share dropdowns are normally anchored to 40px-wide buttons via `position: absolute`. At phone width the mobile media query overrides them to `position: fixed; bottom: 0; left: 0; right: 0; max-height: 70vh; border-radius: 12px 12px 0 0` - thumb-friendly bottom sheets that sidestep all anchor math.
- **Calendar grid unusable at phone width**. The inner 7-column grid stays 7 columns × ~40px each. Content overflows horizontally. `.scheduler-grid` has `overflow-x: hidden` (NOT `.demo-inner` - that would break the sticky toolbar) so any accidental Calendar-mode rendering at phone width clips internally instead of scrolling the whole page. **List view is the only usable mode on phones** - mobile defaults force it.
- **Settings modal on mobile**: tab nav wraps to 2 rows of 3, all 6 tabs (Appearance / Schedule / Event Types / Locations / Contacts / Show) reachable. Schedule's "Call times per weekday" rows stack day-name above times. Contacts header action buttons wrap. Expanded actor cards collapse multi-column grids to single column with `!important` (base rules sit later in the source so override needs higher specificity).
- **Sidebar collapse arrows** muted on mobile to 0.55 opacity + `--color-text-subtle` so they recede - otherwise they look like page navigation at the top of the screen.

---

## Font sizes: em not rem

**Read when**: touching any per-element font size CSS, the SIZE_MAP in settings, or adding new font size controls.

Per-element sizes use `em` units (NOT `rem`) in CSS and the SIZE_MAP so they scale with `--cell-scale` in Day/Week scope views. The CSS variables (`--size-event-type`, `--size-time`, `--size-description`, `--size-cast-badge`, `--size-group-badge`, `--size-notes`, `--size-location`, `--size-conflicts`) are set on `.demo-inner` and apply to BOTH calendar AND list views.

**Rule**: don't use `rem` for anything that should scale with the cell size in Day/Week views. Use `em` + `--cell-scale`.

---

## Group swatch color fallback chain

**Read when**: touching group rendering anywhere (sidebar, day editor "Who's called", group chips).

Group swatches use this fallback chain: `group.color ?? locationColor(group.id) ?? "#6a1b9a"`. Previously some call sites only used `group.color`, which defaulted everything to plum because the color field was empty on the sample show. `locationColor(id)` runs a deterministic hash on the id string to produce a stable color, so Montagues consistently fades to orange and Capulets to purple without needing explicit color assignment.

**Rule**: always use the full fallback chain when rendering a group color. `GroupChip.svelte` is the canonical reference.

---

## CSS custom properties as the theme layer

**Read when**: adding a new color, font, or design token.

Brand colors + all theme tokens live in `packages/standalone/src/lib/theme.css`. Plum `#2d1f3d`, teal `#38817D`. Always use CSS custom properties from theme.css - don't hardcode colors in component CSS.

---

## Reactive proxy cloning gotcha

**Read when**: cloning any piece of Svelte 5 state, especially before persisting to localStorage or serializing for export.

`structuredClone()` fails on Svelte 5 reactive proxies - throws `DataCloneError`. Use `JSON.parse(JSON.stringify(value))` instead. This works because the proxy's JSON serialization unwraps to plain objects, and the round-trip produces a deep-cloned plain object.

**Rule**: never use `structuredClone` on any `$state()` value. Always `JSON.parse(JSON.stringify())`.
