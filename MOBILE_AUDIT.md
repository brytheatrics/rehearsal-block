# Mobile Audit - 2026-04-10

Baseline audit of Rehearsal Block at mobile viewport sizes before starting
the Phase 1 mobile polish pass. Measurements taken at **iPhone SE (375x812)**
unless noted. Reference for "before vs after" comparison.

## Summary

The app is in better shape on mobile than expected. Three of the four key
pages (`/`, `/view`, `/conflicts`) render without horizontal scroll at 375px.
Only `/demo` has a hard blocker. The main issues are:

1. **`/demo` toolbar overflows horizontally** - single biggest bug. Pushes
   the whole page to 599px wide at a 375px viewport.
2. **App header wraps to 2 rows on mobile** (142px tall) - eats too much
   vertical space on every page.
3. **Calendar (month/week) views on `/demo` are unusable at phone width** -
   the inner 7-day grid stays 7 columns, each cell ~40px wide and 841px
   tall. List view is the only usable mode on phones.
4. **No mobile defaults** - the page opens in Calendar + Overview with both
   sidebars visible regardless of viewport.
5. **Em dash in landing page copy** - "The cast \u2014" violates project style.

## Per-page findings

### Landing page (`/`)

No horizontal overflow. Hero pin animation correctly disables on mobile
(`.hero-pin` switches from `sticky` to `relative`). Feature rows stack to
1 column via existing media queries. Mostly good.

Issues:
- App header wraps to 142px tall (logo + 3 nav items don't fit at 375px)
- Hero copy "The cast \u2014" contains a literal em dash
- No other structural problems

### Demo page (`/demo`)

**Blocker: toolbar causes horizontal scroll.** The `.toolbar` element is
575px wide inside a 375px viewport. It has `flex-wrap: wrap` but its
parent `.sticky-bar` gives it `flex: 0 0 auto` with no `min-width: 0`, so
the toolbar takes its content size (575px) instead of shrinking and
wrapping. 12 buttons on one row.

- `document.documentElement.scrollWidth` = 599
- `window.innerWidth` = 375
- Horizontal overflow = 224px

**Calendar grid unusable at phone width.** Inside `.week`, the computed
grid template is:
```
39.875px 39.8875px 39.8875px 39.8875px 39.8875px 39.8875px 39.8875px
```
Each day cell is 40px wide by 841px tall. Content (event type, time,
location, cast chips, description) stacks vertically in a 40px column.

**Scheduler outer layout does collapse to 1 column on mobile.** The 3-column
`[left sidebar] [calendar] [right sidebar]` grid stacks into a single
312px column at mobile. Left sidebar shows above the calendar, right
sidebar below. Functional but means reaching Cast/Team or the day-tool
palette requires scrolling past the entire calendar.

Other numbers at 375px:
- App header: 142px tall (logo + nav wraps)
- Top purchase banner: 89px tall
- Left sidebar: 304x590
- Scheduler total: 312x4293

No mobile defaults: viewport detection is not implemented. Page opens in
Calendar view, Overview scope, both sidebars expanded.

### Shared view page (`/view`)

Already has 2 mobile breakpoints baked in:

- `@media (max-width: 768px)`: column-stacked header, smaller cells
  (70px min-height, 0.69rem font), wrapping filter bar
- `@media (max-width: 480px)`: calendar grid collapses to 1 column with
  day-number prefix, placeholder cells hidden

Not live-tested (needs a real share doc loaded). Source review suggests
it's in the best shape of the four pages. Should verify on real device
once `--host` is enabled.

### Conflicts submission page (`/conflicts/[token]`)

Already mobile-friendly. Tested with sample show loaded into localStorage.

- Viewport 375px, no horizontal overflow
- Cell size: 44x44px (touch target, matches CLAUDE.md intent)
- Cell font: 14px
- 520px breakpoint from `ConflictSubmitter.svelte` widens the "Add timed
  conflict" button to full width and tightens padding

One concern: 6-column week of 44px cells is ~264px wide, fits but feels
tight. May benefit from 48px cells or a list-style fallback in a later
phase. No action in Phase 1.

## Toolbar button inventory (for row-split fix)

12 buttons at 40px each, in DOM order. Planned mobile split: row 1 = first
7 (navigation/view controls), row 2 = last 5 (actions).

Row 1:
1. View toggle (calendar/list)
2. Previous
3. Scope (Overview/Month/Week/Day)
4. Next
5. Filter
6. Undo
7. Redo

Row 2:
8. Default Settings
9. Export
10. Collect conflicts
11. Share
12. Save

## Existing mobile CSS (scattered, pre-audit)

- `DayEditor.svelte` - `.backdrop` is `display: none` on desktop, enabled
  via media query on mobile
- `ConflictSubmitter.svelte` - 520px breakpoint (see above)
- `view/+page.svelte` - 768px and 480px breakpoints (see above)
- Landing page `+page.svelte` - hero pin releases, feature rows stack
- No unified mobile strategy prior to this pass

## Phase 1 scope (this session)

1. Fix toolbar overflow via explicit 7+5 row split on mobile
2. Rework app header to collapse nav into a compact mobile layout
3. Mobile defaults on `/demo` with sticky prefs (list view, overview
   scope, both sidebars collapsed on first mobile visit)
4. Fix em dash in landing page copy
5. Enable `--host` in dev script so real-device testing works over LAN
6. Typecheck + re-verify at 375px in preview

Phases 2 through 4 (`/demo` mobile polish, `/view` and `/conflicts` real
device testing, landing page polish) tracked separately in chat.
