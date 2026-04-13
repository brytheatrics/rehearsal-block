<script lang="ts">
  /**
   * Unified export modal. Replaces the browser's print dialog with our
   * own settings panel so we control page size, orientation, margins,
   * scale, and headers/footers ourselves. Two output paths:
   *
   * - Download PDF: html2pdf.js renders to a real .pdf file directly.
   *   No browser dialog at all.
   * - Print: opens a popup with @page CSS matching the user's settings
   *   and auto-triggers window.print(). The browser dialog still appears
   *   but only as a "confirm which printer" step - orientation, margins,
   *   and scale are already baked in via CSS.
   * - Export CSV: unchanged from before.
   */
  import type { ScheduleDoc, IsoDate } from "@rehearsal-block/core";
  import {
    buildPrintHtml,
    formatUsDateRange,
    weekStartOf,
  } from "@rehearsal-block/core";
  import { buildPdfHeaderHtml, buildPdfFooterHtml } from "$lib/pdf-templates";

  let previewContainerEl = $state<HTMLDivElement | null>(null);
  let previewScale = $state(0.5);
  let pageWidthPx = $state(1056);
  let pageHeightPx = $state(816);
  let pageCount = $state(1);
  let currentPage = $state(0);
  let pageIframes = $state<HTMLIFrameElement[]>([]);

  interface Props {
    show: ScheduleDoc;
    onclose: () => void;
    /** When true, Download PDF opens the paywall instead of generating. */
    readOnly?: boolean;
    onpaywall?: () => void;
  }

  const { show, onclose, readOnly = false, onpaywall }: Props = $props();

  // ---- View mode ----
  let mode = $state<"calendar" | "list">("calendar");

  // ---- Date range ----
  // svelte-ignore state_referenced_locally
  let startDate = $state<IsoDate>(
    weekStartOf(show.show.startDate, show.settings.weekStartsOn),
  );
  // svelte-ignore state_referenced_locally
  let endDate = $state<IsoDate>(show.show.endDate);

  // ---- Page settings ----
  let pageSize = $state<"letter" | "a4" | "legal" | "tabloid">("letter");
  let orientation = $state<"landscape" | "portrait">("landscape");
  let marginPreset = $state<"none" | "small" | "normal" | "large">("normal");
  let scale = $state(100);
  let printBackgrounds = $state(true);
  let pageBreakMode = $state<"months" | "continuous">("continuous");
  let showRunDates = $state(true);
  let showFooterLogo = $state(true);
  let showDownloadDate = $state(false);
  let showPageNumbers = $state(true);
  let repeatHeaders = $state(true);
  let repeatTitle = $state(false);

  // Auto-set orientation based on mode
  $effect(() => {
    orientation = mode === "calendar" ? "landscape" : "portrait";
  });

  function setMode(m: "calendar" | "list") {
    mode = m;
    if (m === "calendar") {
      startDate = weekStartOf(show.show.startDate, show.settings.weekStartsOn);
    } else {
      startDate = show.show.startDate;
    }
    endDate = show.show.endDate;
  }

  // Margin values in mm
  const marginValues = {
    none: 0,
    small: 5,
    normal: 10,
    large: 20,
  } as const;

  // Page dimensions in mm
  const pageSizes = {
    letter: { w: 215.9, h: 279.4, label: "Letter (8.5 x 11)" },
    a4: { w: 210, h: 297, label: "A4 (210 x 297 mm)" },
    legal: { w: 215.9, h: 355.6, label: "Legal (8.5 x 14)" },
    tabloid: { w: 279.4, h: 431.8, label: "Tabloid (11 x 17)" },
  } as const;

  /** Shared export options derived from current settings. */
  const exportOpts = $derived({
    mode,
    startDate,
    endDate,
    action: "pdf" as const,
    pageBreaks: pageBreakMode,
    printBackgrounds,
    showRunDates,
    showDownloadDate,
    showPageNumbers,
    showFooterLogo,
    repeatHeaders,
    repeatTitle,
  });

  /** Live preview HTML, rebuilt whenever settings change. */
  const previewHtml = $derived(buildPrintHtml(show, exportOpts));

  /** Head content extracted from the preview HTML for reuse in per-page iframes. */
  const headContent = $derived(
    previewHtml.match(/<head[^>]*>([\s\S]*?)<\/head>/i)?.[1] ?? "",
  );
  const bodyClass = $derived(
    previewHtml.match(/<body\s+class="([^"]*)"/i)?.[1] ?? "",
  );
  const bodyContent = $derived(
    previewHtml.match(/<body[^>]*>([\s\S]*?)(?:<script[\s\S]*?)?<\/body>/i)?.[1] ?? "",
  );

  let measuredPageChunks = $state<string[]>([]);

  /** Footer options for the in-preview footer rendering. */
  const footerOpts = $derived({
    showFooterLogo,
    showPageNumbers,
    showDownloadDate,
  });
  const hasFooter = $derived(showFooterLogo || showPageNumbers || showDownloadDate);

  /**
   * For "months" mode, split at .print-page divs (simple regex).
   * For "continuous" mode, render into a hidden iframe at page width,
   * measure each top-level block's offset, and split into pages by
   * height. This gives accurate pagination matching the PDF output.
   */
  $effect(() => {
    const _mode = pageBreakMode;
    const _body = bodyContent;
    const _bodyClass = bodyClass;
    const _margin = marginValues[marginPreset];
    const _marginPx = Math.round(_margin * (96 / 25.4));
    const _pageW = pageWidthPx;
    const _pageH = pageHeightPx;
    const _hasFooter = hasFooter;
    const _footerOpts = footerOpts;
    const _repeatHeaders = repeatHeaders;
    const _repeatTitle = repeatTitle;
    const _showName = show.show.name || "Schedule";
    const _showRunDates = showRunDates
      ? formatUsDateRange(startDate, endDate)
      : "";

    const s = scale / 100;
    /* Match the server-side PDF behavior exactly so the preview iframe
       shows what the user will actually download. We do this in two
       parts:
         1. Rewrite every `font-size: Npx` in the original <style>
            (inside _head) by multiplying by the user scale. This is
            the same regex the server uses.
         2. Inject override CSS that bumps .day-cell min-height
            proportionally and restores .print-header h1/.dates back
            to their original (un-scaled) sizes so the show title at
            the top of page 1 stays normal-sized.
       Plus the structural overrides (display:block on .print-page so
       page breaks work, flex:none on .page-content). */
    let _head = headContent;
    if (s !== 1) {
      _head = _head.replace(
        /font-size:\s*(\d+(?:\.\d+)?)px/g,
        (_m, px) => `font-size:${(parseFloat(px) * s).toFixed(2)}px`,
      );
    }
    const cellHeightOverride =
      s !== 1 ? `.day-cell{min-height:${Math.round(70 * s)}px}` : "";
    const headerRestore =
      s !== 1
        ? `.print-header h1{font-size:22px}.print-header .dates{font-size:11px}`
        : "";
    const extraCss = `
      html, body { margin: 0; padding: 0; }
      body {
        padding: ${_marginPx}px;
        min-height: 100vh;
        display: flex;
        flex-direction: column;
        box-sizing: border-box;
      }
      .print-page { break-after: auto; page-break-after: auto; display: block !important; flex: 1; }
      .page-content { flex: none !important; }
      .page-footer { margin-top: auto; }
      ${cellHeightOverride}
      ${headerRestore}
    `;

    if (_mode === "months") {
      // Months mode: pages already contain footers from buildPrintHtml.
      // Extract the header (content before the first .print-page) and
      // prepend it to the first page so the show title is visible.
      const firstPageIdx = _body.indexOf('<div class="print-page">');
      const headerHtml = firstPageIdx > 0 ? _body.substring(0, firstPageIdx) : "";
      const pageRegex = /<div class="print-page">([\s\S]*?)(?=<div class="print-page">|$)/g;
      const pages: string[] = [];
      let match;
      while ((match = pageRegex.exec(_body)) !== null) {
        pages.push(match[1] ?? "");
      }
      if (pages.length === 0) pages.push(_body);

      measuredPageChunks = pages.map((pc, idx) =>
        `<!DOCTYPE html><html><head>${_head}<style>${extraCss}</style></head><body class="${_bodyClass}">${idx === 0 || _repeatTitle ? headerHtml : ""}<div class="print-page">${pc}</div></body></html>`,
      );
      return;
    }

    // Continuous mode: measure block heights in a hidden iframe
    const measurer = document.createElement("iframe");
    measurer.style.position = "absolute";
    measurer.style.left = "-9999px";
    measurer.style.top = "0";
    measurer.style.width = `${_pageW}px`;
    measurer.style.height = `${_pageH * 10}px`;
    measurer.style.border = "none";
    document.body.appendChild(measurer);

    const mDoc = measurer.contentDocument;
    if (!mDoc) {
      document.body.removeChild(measurer);
      measuredPageChunks = [`<!DOCTYPE html><html><head>${_head}<style>${extraCss}</style></head><body class="${_bodyClass}">${_body}</body></html>`];
      return;
    }

    mDoc.open();
    mDoc.write(`<!DOCTYPE html><html><head>${_head}<style>${extraCss}</style></head><body class="${_bodyClass}">${_body}</body></html>`);
    mDoc.close();

    requestAnimationFrame(() => {
      const footerHeight = _hasFooter ? 24 : 0;
      const contentArea = _pageH - _marginPx * 2 - footerHeight;
      const body = mDoc.body;
      if (!body || contentArea <= 0) {
        document.body.removeChild(measurer);
        measuredPageChunks = [`<!DOCTYPE html><html><head>${_head}<style>${extraCss}</style></head><body class="${_bodyClass}">${_body}</body></html>`];
        return;
      }

      // Extract the print-header for repeatTitle
      const printHeader = body.querySelector('.print-header');
      const printHeaderHtml = printHeader ? printHeader.outerHTML : "";
      const printHeaderHeight = printHeader ? printHeader.getBoundingClientRect().height + 14 : 0;

      // Collect all direct children with their heights and metadata
      const children = Array.from(body.children) as HTMLElement[];
      const pages: string[][] = [];
      let currentPageBlocks: string[] = [];
      let currentPageHeight = 0;
      let lastMonthLabel = "";
      let lastWeekdayRow = "";

      for (const child of children) {
        const rect = child.getBoundingClientRect();
        const blockH = rect.height;

        // Track month context for repeat headers
        if (child.classList.contains("month-label")) {
          lastMonthLabel = child.outerHTML;
        }
        if (child.classList.contains("weekday-row")) {
          lastWeekdayRow = child.outerHTML;
        }

        if (currentPageHeight + blockH > contentArea && currentPageBlocks.length > 0) {
          pages.push(currentPageBlocks);
          currentPageBlocks = [];
          currentPageHeight = 0;

          // Repeat title on new pages
          if (_repeatTitle && printHeaderHtml) {
            currentPageBlocks.push(printHeaderHtml);
            currentPageHeight += printHeaderHeight;
          }

          // If repeat headers is on and this is a week-row (not a month header),
          // prepend the last month label + weekday row
          if (_repeatHeaders && child.classList.contains("week-row") && lastMonthLabel) {
            currentPageBlocks.push(lastMonthLabel);
            if (lastWeekdayRow) currentPageBlocks.push(lastWeekdayRow);
            currentPageHeight += 40;
          }
        }

        currentPageBlocks.push(child.outerHTML);
        currentPageHeight += blockH + 4;
      }

      if (currentPageBlocks.length > 0) {
        pages.push(currentPageBlocks);
      }

      document.body.removeChild(measurer);

      if (pages.length === 0) {
        measuredPageChunks = [`<!DOCTYPE html><html><head>${_head}<style>${extraCss}</style></head><body class="${_bodyClass}">${_body}</body></html>`];
      } else {
        const total = pages.length;
        /* Render header + footer using the SAME shared template
           builders the server uses for the actual PDF download, so
           the preview iframe matches the downloaded file:
           - .print-header (the bold Playfair-style title from the
             source HTML) is stripped from EVERY page chunk
           - The Puppeteer-style header (Georgia 14px) is injected on
             every page when repeatTitle is on, or page 1 only otherwise
           - The Puppeteer-style footer is injected on every page when
             any footer toggle is on
           - Body uses flex column so the footer pins to the bottom of
             the visible page area, mirroring Puppeteer's bottom margin
             reservation. */
        measuredPageChunks = pages.map((blocks, idx) => {
          const pageBlocks = blocks
            .filter(
              (b) => !b.startsWith('<div class="print-header"'),
            )
            .join("");
          const showHeaderOnThisPage = _repeatTitle || idx === 0;
          const headerHtml = showHeaderOnThisPage
            ? buildPdfHeaderHtml({
                repeatTitle: true,
                showName: _showName,
                showRunDates: _showRunDates,
              })
            : "";
          const footerHtml = _hasFooter
            ? buildPdfFooterHtml(_footerOpts, idx + 1, total)
            : "";
          return `<!DOCTYPE html><html><head>${_head}<style>${extraCss}</style></head><body class="${_bodyClass}" style="display:flex;flex-direction:column;min-height:100vh;margin:0;padding:0">${headerHtml ? `<div style="padding:${_marginPx}px ${_marginPx}px 0">${headerHtml}</div>` : ""}<div style="flex:1;padding:0 ${_marginPx}px">${pageBlocks}</div>${footerHtml ? `<div style="padding:0 ${_marginPx}px ${_marginPx}px">${footerHtml}</div>` : ""}</body></html>`;
        });
      }
    });
  });

  // Compute page dimensions in pixels (96dpi) and scale to fill the
  // preview container.
  $effect(() => {
    const size = pageSizes[pageSize];
    const wMm = orientation === "landscape" ? size.h : size.w;
    const hMm = orientation === "landscape" ? size.w : size.h;
    const wPx = Math.round(wMm * (96 / 25.4));
    const hPx = Math.round(hMm * (96 / 25.4));
    pageWidthPx = wPx;
    pageHeightPx = hPx;
    pageCount = measuredPageChunks.length || 1;
    if (currentPage >= pageCount) currentPage = Math.max(0, pageCount - 1);

    requestAnimationFrame(() => {
      if (!previewContainerEl) return;
      const containerRect = previewContainerEl.getBoundingClientRect();
      const availW = containerRect.width - 48;
      const availH = containerRect.height - 80; // room for page nav
      if (availW > 0 && availH > 0) {
        previewScale = Math.min(availW / wPx, availH / hPx, 1);
      }
    });
  });

  // Push the current page's HTML into its iframe.
  $effect(() => {
    const chunks = measuredPageChunks;
    const page = currentPage;
    const iframes = pageIframes;
    if (!chunks.length || !iframes.length) return;
    const iframe = iframes[0];
    if (!iframe) return;
    const iframeDoc = iframe.contentDocument;
    if (!iframeDoc) return;
    const idx = Math.min(page, chunks.length - 1);
    const html = chunks[idx] ?? "";
    iframeDoc.open();
    iframeDoc.write(html);
    iframeDoc.close();

    // Reset iframe dimensions to match the page
    iframe.style.width = `${pageWidthPx}px`;
    iframe.style.height = `${pageHeightPx}px`;
    const wrapper = iframe.parentElement;
    if (wrapper) {
      wrapper.style.width = `${pageWidthPx * previewScale}px`;
      wrapper.style.height = `${pageHeightPx * previewScale}px`;
    }
  });

  let downloading = $state(false);

  let pdfError = $state("");

  /** Shared fetch to the PDF server endpoint. */
  async function generatePdf(): Promise<Blob> {
    const html = buildPrintHtml(show, { ...exportOpts, action: "pdf" });
    const filename =
      (show.show.name || "Schedule").replace(/\s+/g, "_") + "_Schedule.pdf";

    const res = await fetch("/api/pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        html,
        pageSize,
        orientation,
        marginMm: marginValues[marginPreset],
        scale,
        printBackground: printBackgrounds,
        filename,
        showFooterLogo,
        showPageNumbers,
        showDownloadDate,
        repeatTitle,
        showName: show.show.name || "Schedule",
        fontHeading: show.settings.fontHeading ?? "Playfair Display",
        // formatUsDateRange truncates the redundant first year when
        // start and end share a year ("May 4 - Jun 14, 2026" instead
        // of "May 4, 2026 - Jun 14, 2026").
        showRunDates: showRunDates ? formatUsDateRange(startDate, endDate) : "",
      }),
      signal: AbortSignal.timeout(25_000),
    });

    if (!res.ok) {
      const msg = await res.text().catch(() => "Unknown error");
      throw new Error(msg);
    }

    return res.blob();
  }

  async function handleDownloadPdf() {
    downloading = true;
    pdfError = "";
    try {
      // Build the full HTML with export settings
      const html = buildPrintHtml(show, { ...exportOpts, action: "print" });

      // Apply scale by rewriting font-size values (same as server did)
      const s = scale / 100;
      let finalHtml = s !== 1
        ? html.replace(/font-size:\s*([\d.]+)px/g, (_m, v) => `font-size: ${(parseFloat(v) * s).toFixed(1)}px`)
        : html;

      // Inject @page CSS for page size, orientation, and margins
      const dim = pageSizes[pageSize];
      const w = orientation === "landscape" ? dim.h : dim.w;
      const h = orientation === "landscape" ? dim.w : dim.h;
      const m = marginValues[marginPreset];
      const pageStyle = `<style>@page { size: ${w}mm ${h}mm; margin: ${m}mm; }</style>`;
      finalHtml = finalHtml.replace("</head>", `${pageStyle}</head>`);

      // Build header/footer and inject before closing </body>
      const headerHtml = repeatTitle ? buildPdfHeaderHtml({
        repeatTitle: true,
        showName: show.show.name || "Schedule",
        showRunDates: showRunDates ? formatUsDateRange(startDate, endDate) : "",
      }) : "";
      const footerHtml = hasFooter ? buildPdfFooterHtml(footerOpts) : "";

      if (headerHtml || footerHtml) {
        const extra = `<style>
          .pdf-injected-header { border-bottom: 2px solid #4b5563; padding-bottom: 6px; margin-bottom: 12px; }
          .pdf-injected-footer { border-top: 1px solid #e0e0e0; padding-top: 4px; margin-top: 12px; font-size: 8px; color: #888; text-align: center; }
        </style>`;
        const headerBlock = headerHtml ? `<div class="pdf-injected-header">${headerHtml}</div>` : "";
        const footerBlock = footerHtml ? `<div class="pdf-injected-footer">${footerHtml}</div>` : "";
        finalHtml = finalHtml.replace("</head>", `${extra}</head>`);
        // Inject header at start of body content and footer at end
        finalHtml = finalHtml.replace(/<body([^>]*)>/, `<body$1>${headerBlock}`);
        finalHtml = finalHtml.replace(/<\/body>/, `${footerBlock}</body>`);
      }

      // Open as a blob URL so the document loads fully (scripts, fonts, etc.)
      const blob = new Blob([finalHtml], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      const win = window.open(url, "_blank");

      if (!win) {
        pdfError = "Pop-up blocked. Please allow pop-ups for this site.";
        URL.revokeObjectURL(url);
      } else {
        // Clean up the blob URL after the window loads
        win.addEventListener("afterprint", () => URL.revokeObjectURL(url));
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      }
    } catch (err) {
      console.error("PDF generation failed:", err);
      pdfError = "PDF generation failed. Please try again.";
    }
    downloading = false;
  }

  function onEscape(e: KeyboardEvent) {
    if (e.key === "Escape") onclose();
  }
</script>

<svelte:window onkeydown={onEscape} />

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="backdrop" onclick={onclose}></div>

<div class="modal" role="dialog" aria-modal="true" aria-label="Download PDF">
  <header class="modal-header">
    <div>
      <div class="eyebrow">Download PDF</div>
      <h2>{show.show.name || "Schedule"}</h2>
    </div>
    <button type="button" class="close-btn" onclick={onclose} aria-label="Close">
      ×
    </button>
  </header>

  <div class="modal-body">
    <div class="split-layout">
      <!-- Left: settings -->
      <div class="settings-panel">
        <section class="section">
          <div class="section-label">View</div>
          <div class="mode-toggle">
            <button
              type="button"
              class="mode-btn"
              class:active={mode === "calendar"}
              onclick={() => setMode("calendar")}
            >
              Calendar
            </button>
            <button
              type="button"
              class="mode-btn"
              class:active={mode === "list"}
              onclick={() => setMode("list")}
            >
              List
            </button>
          </div>
        </section>

        <section class="section">
          <div class="section-label">Date range</div>
          <div class="row">
            <div class="field">
              <label for="export-start">From</label>
              <input
                id="export-start"
                type="date"
                value={startDate}
                onchange={(e) => (startDate = e.currentTarget.value)}
              />
            </div>
            <div class="field">
              <label for="export-end">To</label>
              <input
                id="export-end"
                type="date"
                value={endDate}
                onchange={(e) => (endDate = e.currentTarget.value)}
              />
            </div>
          </div>
        </section>

        <section class="section">
          <div class="section-label">Page setup</div>
          <div class="field">
            <label for="page-size">Page size</label>
            <select
              id="page-size"
              value={pageSize}
              onchange={(e) => (pageSize = e.currentTarget.value as typeof pageSize)}
            >
              {#each Object.entries(pageSizes) as [key, val] (key)}
                <option value={key}>{val.label}</option>
              {/each}
            </select>
          </div>
          <div class="row">
            <div class="field">
              <label for="orientation">Orientation</label>
              <select
                id="orientation"
                value={orientation}
                onchange={(e) => (orientation = e.currentTarget.value as typeof orientation)}
              >
                <option value="portrait">Portrait</option>
                <option value="landscape">Landscape</option>
              </select>
            </div>
            <div class="field">
              <label for="margins">Margins</label>
              <select
                id="margins"
                value={marginPreset}
                onchange={(e) => (marginPreset = e.currentTarget.value as typeof marginPreset)}
              >
                <option value="none">None</option>
                <option value="small">Small</option>
                <option value="normal">Normal</option>
                <option value="large">Large</option>
              </select>
            </div>
          </div>
          <div class="field">
            <label for="scale">Scale</label>
            <div class="scale-row">
              <input
                id="scale"
                type="range"
                min="50"
                max="150"
                step="5"
                value={scale}
                oninput={(e) => (scale = Number(e.currentTarget.value))}
              />
              <span class="scale-value">{scale}%</span>
              {#if scale !== 100}
                <button
                  type="button"
                  class="scale-reset"
                  onclick={() => (scale = 100)}
                  title="Reset to 100%"
                >
                  Reset
                </button>
              {/if}
            </div>
          </div>
        </section>

        <section class="section">
          <div class="section-label">Page breaks</div>
          <div class="mode-toggle small-toggle">
            <button
              type="button"
              class="mode-btn"
              class:active={pageBreakMode === "continuous"}
              onclick={() => (pageBreakMode = "continuous")}
            >
              Auto
            </button>
            <button
              type="button"
              class="mode-btn"
              class:active={pageBreakMode === "months"}
              onclick={() => (pageBreakMode = "months")}
            >
              Per month
            </button>
          </div>
        </section>

        <section class="section">
          <div class="section-label">Options</div>
          <div class="toggle-grid">
            <label class="toggle">
              <input
                type="checkbox"
                checked={printBackgrounds}
                onchange={(e) => (printBackgrounds = e.currentTarget.checked)}
              />
              <span>Background colors</span>
            </label>
            <label class="toggle">
              <input
                type="checkbox"
                checked={showRunDates}
                onchange={(e) => (showRunDates = e.currentTarget.checked)}
              />
              <span>Run dates</span>
            </label>
            <label class="toggle">
              <input
                type="checkbox"
                checked={repeatTitle}
                onchange={(e) => (repeatTitle = e.currentTarget.checked)}
              />
              <span>Title on all pages</span>
            </label>
            <label class="toggle">
              <input
                type="checkbox"
                checked={repeatHeaders}
                onchange={(e) => (repeatHeaders = e.currentTarget.checked)}
              />
              <span>Repeat headers on split pages</span>
            </label>
          </div>
        </section>

        <section class="section">
          <div class="section-label">Footer</div>
          <div class="toggle-grid">
            <label class="toggle">
              <input
                type="checkbox"
                checked={showFooterLogo}
                onchange={(e) => (showFooterLogo = e.currentTarget.checked)}
              />
              <span>Logo</span>
            </label>
            <label class="toggle">
              <input
                type="checkbox"
                checked={showPageNumbers}
                onchange={(e) => (showPageNumbers = e.currentTarget.checked)}
              />
              <span>Page numbers</span>
            </label>
            <label class="toggle">
              <input
                type="checkbox"
                checked={showDownloadDate}
                onchange={(e) => (showDownloadDate = e.currentTarget.checked)}
              />
              <span>Download date</span>
            </label>
          </div>
        </section>
      </div>

      <!-- Right: live preview -->
      <div class="preview-panel">
        <div class="preview-top">
          <span class="preview-label">Preview</span>
          <div class="page-nav">
            <button
              type="button"
              class="page-nav-btn"
              disabled={currentPage === 0}
              onclick={() => (currentPage = Math.max(0, currentPage - 1))}
            >
              &#9664;
            </button>
            <span class="page-indicator">
              Page {currentPage + 1} of {pageCount}
            </span>
            <button
              type="button"
              class="page-nav-btn"
              disabled={currentPage >= pageCount - 1}
              onclick={() => (currentPage = Math.min(pageCount - 1, currentPage + 1))}
            >
              &#9654;
            </button>
          </div>
        </div>
        <div class="preview-container" bind:this={previewContainerEl}>
          <div
            class="page-shadow"
            style:width="{pageWidthPx * previewScale}px"
            style:height="{pageHeightPx * previewScale}px"
          >
            <iframe
              bind:this={pageIframes[0]}
              class="preview-iframe"
              title="Print preview"
              sandbox="allow-same-origin"
              style:width="{pageWidthPx}px"
              style:height="{pageHeightPx}px"
              style:transform="scale({previewScale})"
            ></iframe>
          </div>
        </div>
      </div>
    </div>
  </div>

  <footer class="modal-footer">
    {#if pdfError}
      <span class="pdf-error">{pdfError}</span>
    {/if}
    <button type="button" class="btn btn-secondary" onclick={onclose}>
      Cancel
    </button>
    <button
      type="button"
      class="btn btn-primary"
      onclick={() => {
        if (readOnly && onpaywall) {
          onclose();
          onpaywall();
        } else {
          handleDownloadPdf();
        }
      }}
      disabled={downloading}
    >
      {downloading ? "Generating..." : "Download PDF"}
    </button>
  </footer>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(45, 31, 61, 0.6);
    z-index: 100;
  }

  .modal {
    position: fixed;
    inset: 0;
    background: var(--color-surface);
    z-index: 110;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .modal-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    padding: var(--space-4) var(--space-5);
    border-bottom: 1px solid var(--color-border);
    gap: var(--space-3);
  }

  .eyebrow {
    font-size: 0.6875rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--color-text-subtle);
    font-weight: 700;
    margin-bottom: 2px;
  }

  .modal-header h2 {
    font-family: var(--font-display);
    color: var(--color-plum);
    font-size: 1.125rem;
    margin: 0;
  }

  .close-btn {
    background: transparent;
    border: none;
    font-size: 1.5rem;
    cursor: pointer;
    color: var(--color-text-muted);
    line-height: 1;
    padding: 0 var(--space-2);
    border-radius: var(--radius-sm);
  }
  .close-btn:hover {
    color: var(--color-plum);
  }

  .modal-body {
    flex: 1;
    overflow: hidden;
    padding: var(--space-4) var(--space-5);
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  .split-layout {
    display: grid;
    grid-template-columns: 320px 1fr;
    gap: var(--space-5);
    flex: 1;
    min-height: 0;
  }

  .settings-panel {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    overflow-y: auto;
  }

  .preview-panel {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    min-height: 0;
  }

  .preview-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .preview-label {
    font-size: 0.6875rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--color-text-subtle);
    font-weight: 700;
  }

  .page-nav {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .page-nav-btn {
    width: 1.75rem;
    height: 1.75rem;
    padding: 0;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: var(--color-surface);
    color: var(--color-text);
    font-size: 0.75rem;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition: all var(--transition-fast);
  }
  .page-nav-btn:hover:not(:disabled) {
    border-color: var(--color-plum);
    color: var(--color-plum);
  }
  .page-nav-btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  .page-indicator {
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--color-text);
    min-width: 6rem;
    text-align: center;
  }

  .preview-container {
    flex: 1;
    min-height: 0;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: #e5e5e5;
    overflow: auto;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-5);
  }

  .page-shadow {
    background: #fff;
    box-shadow:
      0 2px 8px rgba(0, 0, 0, 0.15),
      0 0 1px rgba(0, 0, 0, 0.1);
    border-radius: 1px;
    overflow: hidden;
    flex-shrink: 0;
  }

  .preview-iframe {
    border: none;
    display: block;
    transform-origin: top left;
  }

  .section {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .section-label {
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--color-text-subtle);
    font-weight: 700;
  }

  .mode-toggle {
    display: flex;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-full);
    overflow: hidden;
  }

  .mode-btn {
    flex: 1;
    font: inherit;
    font-size: 0.8125rem;
    font-weight: 600;
    padding: var(--space-2) var(--space-3);
    border: none;
    background: transparent;
    color: var(--color-text-muted);
    cursor: pointer;
    transition:
      background var(--transition-fast),
      color var(--transition-fast);
  }
  .mode-btn:hover {
    color: var(--color-plum);
  }
  .mode-btn.active {
    background: var(--color-plum);
    color: var(--color-text-inverse);
  }

  .row {
    display: flex;
    gap: var(--space-4);
  }

  .field {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .field label {
    font-size: 0.6875rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--color-text-subtle);
    font-weight: 700;
  }

  .field input[type="date"],
  .field select {
    font: inherit;
    font-size: 0.8125rem;
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--color-border-strong);
    border-radius: var(--radius-sm);
    background: var(--color-surface);
    color: var(--color-text);
    cursor: pointer;
  }
  .field input:focus,
  .field select:focus {
    outline: 2px solid var(--color-teal);
    outline-offset: 0;
    border-color: var(--color-teal);
  }

  .scale-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .scale-row input[type="range"] {
    flex: 1;
    accent-color: var(--color-teal);
  }

  .scale-value {
    font-size: 0.75rem;
    font-weight: 700;
    color: var(--color-text);
    min-width: 3rem;
    text-align: right;
  }

  .scale-reset {
    font: inherit;
    font-size: 0.6875rem;
    font-weight: 600;
    padding: 2px 8px;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: var(--color-surface);
    color: var(--color-text-muted);
    cursor: pointer;
    white-space: nowrap;
    transition: all var(--transition-fast);
  }
  .scale-reset:hover {
    border-color: var(--color-plum);
    color: var(--color-plum);
  }

  .small-toggle {
    font-size: 0.75rem;
  }
  .small-toggle .mode-btn {
    font-size: 0.75rem;
    padding: var(--space-1) var(--space-2);
  }

  .toggle-grid {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .toggle {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-size: 0.8125rem;
    color: var(--color-text);
    cursor: pointer;
  }

  .modal-footer {
    display: flex;
    justify-content: flex-end;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-3) var(--space-5);
    border-top: 1px solid var(--color-border);
    background: var(--color-bg-alt);
  }

  .pdf-error {
    color: #dc2626;
    font-size: 0.8125rem;
    margin-right: auto;
  }
</style>
