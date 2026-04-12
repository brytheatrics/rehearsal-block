# window.print() Baseline Assessment (Phase 6 Step 1)

Date: 2026-04-11
Based on: code review of `buildPrintHtml` in `packages/core/src/export.ts`
and `pdf-templates.ts` in `packages/standalone/src/lib/`.

## Current state

`openPrintWindow()` (export.ts:1432) already opens a popup with the
`buildPrintHtml` output. It does NOT call `window.print()` on the popup -
the user has to manually Ctrl+P from the popup to trigger the browser
print dialog. The Print option in the ExportModal's dropdown calls this
function.

The HTML is very mature from months of Puppeteer iteration. It has:

### What already works for browser print

- **`@page` rules**: `size: landscape/portrait`, `margin: 0.4in/0.5in`
  (Chrome respects these in native print)
- **`break-inside: avoid`** + **`page-break-inside: avoid`** on `.week-row`
  and `.list-day` (Chrome respects these in native print)
- **`.print-page` break-after**: explicit page breaks via `break-after: page`
  + `page-break-after: always` (Chrome respects these)
- **`-webkit-print-color-adjust: exact`** + **`print-color-adjust: exact`**
  (forces background colors to print - event type badges, chips, etc.)
- **Font-size regex scaling**: the scale slider works by rewriting `font-size: Npx`
  in the embedded `<style>` to scale all text proportionally. This is pure CSS,
  no dependency on Puppeteer's `scale` option.
- **Google Fonts `<link>` in the body HTML**: fonts load in the popup window
  (unlike Puppeteer's headerTemplate which can't fetch external resources).
- **Self-contained SVG logo** for the footer (inline, no external refs).
- **Calendar AND list mode** layouts with full CSS.
- **Both per-month and continuous page break strategies** for calendar mode.

### What Puppeteer provides that native print CANNOT

1. **Running headers/footers in page margins** (`headerTemplate` /
   `footerTemplate`). Chrome's native print uses `@page` margin areas but
   does NOT support `@top-center` / `@bottom-right` or any CSS Paged Media
   Level 3 named regions. The Puppeteer templates put the show title in the
   top margin and the logo + page numbers + date in the bottom margin.
   **With native print, these don't exist.** The user gets no running
   header/footer.

2. **`counter(page)` / `counter(pages)` for "Page X of Y"**. Chrome's
   native print engine does not expose page counters to CSS. Puppeteer's
   templates use special `<span class="pageNumber">` / `<span class="totalPages">`
   elements that Chromium's PDF renderer replaces with actual numbers.
   **With native print, there's no way to get page numbers.**

3. **Programmatic PDF file generation** (the "Download PDF" button).
   `window.print()` opens the system print dialog, which can "Print to PDF"
   on most OSes, but it's a manual flow (user picks a filename, clicks Save).
   Not a one-click download.

4. **Precise control over the output filename**. Puppeteer returns a buffer
   that the server sends as `Content-Disposition: attachment; filename="..."`.
   Native print-to-PDF uses whatever filename the OS dialog defaults to.

### What paged.js would add

paged.js is the CSS Paged Media Level 3 polyfill that Phase 6 step 2
proposes. It fills in the gaps above:

- **Named page margin regions** (`@top-center`, `@bottom-right`) for
  running headers and footers. paged.js pre-renders these into the DOM
  before calling `window.print()`, so Chrome sees them as regular elements
  positioned in the margin areas.
- **`counter(page)` / `counter(pages)`** - paged.js computes these during
  its pagination pass and injects the values into the DOM.
- **`afterPreview` / `rendered` events** so we know layout is stable before
  triggering print.
- The actual `window.print()` call would then produce a PDF (via Chrome's
  built-in "Print to PDF" or a physical printer) with full headers, footers,
  and page numbers - matching the current Puppeteer output quality.

### Gap assessment: how bad is native print WITHOUT paged.js?

| Feature | Puppeteer | Native print | paged.js |
|---|---|---|---|
| Page breaks | Yes | Yes (already works) | Yes |
| Font scaling | Yes (regex) | Yes (same regex) | Yes |
| Background colors | Yes | Yes (print-color-adjust) | Yes |
| Custom fonts | Yes | Yes (Google Fonts link) | Yes |
| Orientation/margins | Yes | Yes (@page rules) | Yes |
| Running header (show title) | Yes | **NO** | Yes |
| Running footer (logo + page #) | Yes | **NO** | Yes |
| Page X of Y numbers | Yes | **NO** | Yes |
| One-click PDF download | Yes | **NO** (manual dialog) | **NO** (still manual) |
| Custom filename | Yes | **NO** | **NO** |

**Bottom line**: native `window.print()` on the current HTML produces a
clean, well-formatted schedule with correct page breaks, fonts, colors,
and scaling. The only missing pieces are the running header/footer and
page numbers. For many users this is "good enough" - the schedule content
is all there, it's just missing the chrome around the edges.

paged.js closes the header/footer/page-number gap. Neither native print
nor paged.js can do a one-click download without a server, but Chrome's
built-in "Save as PDF" in the print dialog is a reasonable UX (2 clicks
instead of 1).

## Recommendation for Phase 6

1. **Add `popup.print()` call to `openPrintWindow()`** as an immediate
   improvement. The popup already opens with the right HTML - just trigger
   the print dialog automatically instead of making the user Ctrl+P. One
   line of code.

2. **Prototype paged.js on a branch** to add the running header, footer,
   and page numbers. If it works cleanly at 100%/150%/200% scale, wire it
   into ExportModal as the default PDF path and replace the Puppeteer
   "Download PDF" button with "Print / Save as PDF" that opens the paged.js
   enhanced print dialog.

3. **Keep `/api/pdf` as a localhost-only dev tool** for visual diffing
   (the debug-calendar-pdf.mts harness).

## Files involved

- `packages/core/src/export.ts` - `buildPrintHtml()`, `openPrintWindow()`
- `packages/standalone/src/lib/pdf-templates.ts` - header/footer template builders
- `packages/standalone/src/lib/components/scheduler/ExportModal.svelte` - modal UI
- `packages/standalone/scripts/debug-calendar-pdf.mts` - visual diff harness
