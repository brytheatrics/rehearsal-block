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
  /** Zoom mode: "fit" = auto-scale to container, "actual" = 100%, custom = manual scale. */
  let zoomMode = $state<"fit" | "actual" | "custom">("fit");
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
    /** "pdf" opens with Download PDF button, "print" opens with Print button. */
    outputMode?: "pdf" | "print";
    /** Called when user clicks Collapse/Expand groups. Hides the buttons if not provided. */
    onconvertgroups?: (mode: "collapse" | "expand") => void;
  }

  const { show, onclose, readOnly = false, onpaywall, outputMode = "pdf", onconvertgroups }: Props = $props();

  // ---- Defaults ----
  const DEFAULTS = {
    mode: "calendar" as "calendar" | "list",
    pageSize: "letter" as "letter" | "a4" | "legal" | "tabloid",
    orientation: "landscape" as "landscape" | "portrait",
    marginPreset: "normal" as "none" | "small" | "normal" | "large",
    scale: 100,
    printBackgrounds: true,
    pageBreakMode: "continuous" as "months" | "continuous",
    showRunDates: true,
    showFooterLogo: true,
    showDownloadDate: true,
    showPageNumbers: true,
    repeatHeaders: true,
    repeatTitle: true,
    showLocationShapes: false,
    colorMode: "color" as "color" | "bw",
  };

  const PREFS_KEY = "rehearsal-block:export-prefs";

  function loadSavedPrefs(): Partial<typeof DEFAULTS> {
    if (typeof window === "undefined") return {};
    try {
      const raw = localStorage.getItem(PREFS_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  }

  const saved = loadSavedPrefs();

  // ---- View mode ----
  let mode = $state<"calendar" | "list">(saved.mode ?? DEFAULTS.mode);

  // ---- Date range ----
  // svelte-ignore state_referenced_locally
  let startDate = $state<IsoDate>(
    weekStartOf(show.show.startDate, show.settings.weekStartsOn),
  );
  // svelte-ignore state_referenced_locally
  let endDate = $state<IsoDate>(show.show.endDate);

  // ---- Page settings ----
  let pageSize = $state<"letter" | "a4" | "legal" | "tabloid">(saved.pageSize ?? DEFAULTS.pageSize);
  let orientation = $state<"landscape" | "portrait">(saved.orientation ?? DEFAULTS.orientation);
  let marginPreset = $state<"none" | "small" | "normal" | "large">(saved.marginPreset ?? DEFAULTS.marginPreset);
  let scale = $state(saved.scale ?? DEFAULTS.scale);
  let printBackgrounds = $state(saved.printBackgrounds ?? DEFAULTS.printBackgrounds);
  let pageBreakMode = $state<"months" | "continuous">(saved.pageBreakMode ?? DEFAULTS.pageBreakMode);
  let showRunDates = $state(saved.showRunDates ?? DEFAULTS.showRunDates);
  let showFooterLogo = $state(saved.showFooterLogo ?? DEFAULTS.showFooterLogo);
  let showDownloadDate = $state(saved.showDownloadDate ?? DEFAULTS.showDownloadDate);
  let showPageNumbers = $state(saved.showPageNumbers ?? DEFAULTS.showPageNumbers);
  let repeatHeaders = $state(saved.repeatHeaders ?? DEFAULTS.repeatHeaders);
  let repeatTitle = $state(saved.repeatTitle ?? DEFAULTS.repeatTitle);
  let showLocationShapes = $state(saved.showLocationShapes ?? DEFAULTS.showLocationShapes);
  let colorMode = $state<"color" | "bw">(saved.colorMode ?? DEFAULTS.colorMode);

  // Auto-save settings to localStorage when they change
  $effect(() => {
    const prefs = {
      mode, pageSize, orientation, marginPreset, scale, printBackgrounds,
      pageBreakMode, showRunDates, showFooterLogo, showDownloadDate,
      showPageNumbers, repeatHeaders, repeatTitle, showLocationShapes, colorMode,
    };
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { /* ignore */ }
  });

  function resetDateRange() {
    startDate = mode === "calendar"
      ? weekStartOf(show.show.startDate, show.settings.weekStartsOn)
      : show.show.startDate;
    endDate = show.show.endDate;
  }

  function resetAllSettings() {
    mode = DEFAULTS.mode;
    pageSize = DEFAULTS.pageSize;
    orientation = DEFAULTS.orientation;
    marginPreset = DEFAULTS.marginPreset;
    scale = DEFAULTS.scale;
    printBackgrounds = DEFAULTS.printBackgrounds;
    pageBreakMode = DEFAULTS.pageBreakMode;
    showRunDates = DEFAULTS.showRunDates;
    showFooterLogo = DEFAULTS.showFooterLogo;
    showDownloadDate = DEFAULTS.showDownloadDate;
    showPageNumbers = DEFAULTS.showPageNumbers;
    repeatHeaders = DEFAULTS.repeatHeaders;
    repeatTitle = DEFAULTS.repeatTitle;
    showLocationShapes = DEFAULTS.showLocationShapes;
    colorMode = DEFAULTS.colorMode;
    resetDateRange();
    try { localStorage.removeItem(PREFS_KEY); } catch { /* ignore */ }
  }

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
  /** Show object with export-specific overrides (e.g. location shapes toggle). */
  const exportShow = $derived({
    ...show,
    settings: { ...show.settings, showLocationShapes },
  });
  const rawPreviewHtml = $derived(buildPrintHtml(exportShow, exportOpts));
  const previewHtml = $derived(
    colorMode === "bw"
      ? rawPreviewHtml.replace("</head>", '<style>body{filter:grayscale(1)!important;-webkit-filter:grayscale(1)!important}</style></head>')
      : rawPreviewHtml,
  );

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
      // Months mode: each month is a .print-page div from buildPrintHtml.
      // If a month's content exceeds the page height (e.g. at high scale),
      // split it across multiple pages using the same measurement approach
      // as continuous mode.
      const firstPageIdx = _body.indexOf('<div class="print-page">');
      const printHeaderHtml = firstPageIdx > 0 ? _body.substring(0, firstPageIdx) : "";
      const pageRegex = /<div class="print-page">([\s\S]*?)(?=<div class="print-page">|$)/g;
      const rawMonths: string[] = [];
      let match;
      while ((match = pageRegex.exec(_body)) !== null) {
        const content = (match[1] ?? "")
          .replace(/<div class="page-footer">[\s\S]*?<\/div>/, "")
          .replace(/<div class="print-header">[\s\S]*?<\/div>\s*/, "");
        rawMonths.push(content);
      }
      if (rawMonths.length === 0) rawMonths.push(_body);

      // Measure each month in a hidden iframe and split if needed
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
        // Fallback: no measurement, one page per month
        measuredPageChunks = rawMonths.map((pc) =>
          `<!DOCTYPE html><html><head>${_head}<style>${extraCss}</style></head><body class="${_bodyClass}">${printHeaderHtml}<div class="print-page">${pc}</div></body></html>`);
        return;
      }

      requestAnimationFrame(() => {
        const footerHeight = _hasFooter ? 24 : 0;
        const titleHeight = printHeaderHtml ? 50 : 0;
        const headerHeight = 40; // Puppeteer-style header approximate
        const contentArea = _pageH - _marginPx * 2 - footerHeight;

        const allPages: string[][] = [];

        for (let mi = 0; mi < rawMonths.length; mi++) {
          const monthHtml = rawMonths[mi]!;

          // Render month into the measurer
          mDoc.open();
          mDoc.write(`<!DOCTYPE html><html><head>${_head}<style>${extraCss}</style></head><body class="${_bodyClass}" style="padding:${_marginPx}px">${mi === 0 ? printHeaderHtml : ""}<div class="print-page">${monthHtml}</div></body></html>`);
          mDoc.close();

          const body = mDoc.body;
          // Content is wrapped in .page-content inside .print-page
          const children = Array.from(
            body.querySelectorAll(".page-content > *") as NodeListOf<HTMLElement>
          );
          if (children.length === 0) {
            // Fallback: try direct children of .print-page
            children.push(...Array.from(body.querySelectorAll(".print-page > *") as NodeListOf<HTMLElement>));
          }
          if (children.length === 0) {
            allPages.push([monthHtml]);
            continue;
          }

          // Check total height
          const totalH = children.reduce((sum, el) => sum + el.getBoundingClientRect().height, 0);
          const firstPageArea = contentArea - (mi === 0 || _repeatTitle ? titleHeight + headerHeight : 0);

          if (totalH <= firstPageArea) {
            // Fits on one page
            allPages.push([monthHtml]);
          } else {
            // Split this month across pages
            let currentBlocks: string[] = [];
            let currentH = 0;
            const pageArea = contentArea - (_repeatTitle ? headerHeight : 0);
            let availH = firstPageArea;
            let lastWeekdayRowHtml = "";
            let lastMonthLabelHtml = "";

            for (const child of children) {
              const h = child.getBoundingClientRect().height;

              // Track weekday row and month label for repeat headers
              if (child.classList.contains("weekday-row")) {
                lastWeekdayRowHtml = child.outerHTML;
              }
              if (child.classList.contains("month-label")) {
                lastMonthLabelHtml = child.outerHTML;
              }

              if (currentH + h > availH && currentBlocks.length > 0) {
                allPages.push(currentBlocks);
                currentBlocks = [];
                currentH = 0;
                availH = pageArea;

                // Repeat weekday headers on new pages
                if (_repeatHeaders && lastWeekdayRowHtml) {
                  if (lastMonthLabelHtml) {
                    currentBlocks.push(lastMonthLabelHtml);
                  }
                  currentBlocks.push(lastWeekdayRowHtml);
                  currentH += lastMonthLabelHtml ? 40 : 24;
                }
              }
              currentBlocks.push(child.outerHTML);
              currentH += h;
            }
            if (currentBlocks.length > 0) allPages.push(currentBlocks);
          }
        }

        document.body.removeChild(measurer);

        const total = allPages.length;
        measuredPageChunks = allPages.map((blocks, idx) => {
          const showHeaderOnThisPage = _repeatTitle || idx === 0;
          const hdrHtml = showHeaderOnThisPage
            ? buildPdfHeaderHtml({ repeatTitle: true, showName: _showName, showRunDates: _showRunDates })
            : "";
          const ftrHtml = _hasFooter ? buildPdfFooterHtml(_footerOpts, idx + 1, total) : "";
          const contentPadTop = hdrHtml ? 0 : _marginPx;
          const pageContent = Array.isArray(blocks) ? blocks.join("") : blocks;
          return `<!DOCTYPE html><html><head>${_head}<style>${extraCss}</style></head><body class="${_bodyClass}" style="display:flex;flex-direction:column;min-height:100vh;margin:0;padding:0">${hdrHtml ? `<div style="padding:${_marginPx}px ${_marginPx}px 0">${hdrHtml}</div>` : ""}<div style="flex:1;padding:${contentPadTop}px ${_marginPx}px 0"><div class="print-page">${pageContent}</div></div>${ftrHtml ? `<div style="padding:0 ${_marginPx}px ${_marginPx}px">${ftrHtml}</div>` : ""}</body></html>`;
        });
      });
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

          // Always repeat the weekday row (and month label if available)
          // on new pages so readers know which days they're looking at
          if (_repeatHeaders && lastWeekdayRow) {
            if (lastMonthLabel) {
              currentPageBlocks.push(lastMonthLabel);
            }
            currentPageBlocks.push(lastWeekdayRow);
            currentPageHeight += lastMonthLabel ? 40 : 24;
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
          const contentPadTop = headerHtml ? 0 : _marginPx;
          return `<!DOCTYPE html><html><head>${_head}<style>${extraCss}</style></head><body class="${_bodyClass}" style="display:flex;flex-direction:column;min-height:100vh;margin:0;padding:0">${headerHtml ? `<div style="padding:${_marginPx}px ${_marginPx}px 0">${headerHtml}</div>` : ""}<div style="flex:1;padding:${contentPadTop}px ${_marginPx}px 0">${pageBlocks}</div>${footerHtml ? `<div style="padding:0 ${_marginPx}px ${_marginPx}px">${footerHtml}</div>` : ""}</body></html>`;
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
      if (zoomMode === "fit") {
        const containerRect = previewContainerEl.getBoundingClientRect();
        const availW = containerRect.width - 48;
        const availH = containerRect.height - 80;
        if (availW > 0 && availH > 0) {
          previewScale = Math.min(availW / wPx, availH / hPx, 1);
        }
      } else if (zoomMode === "actual") {
        previewScale = 1;
      }
      // zoomMode === "custom" -> previewScale already set by +/- handlers
    });
  });

  function zoomFit() {
    zoomMode = "fit";
    if (!previewContainerEl) return;
    const containerRect = previewContainerEl.getBoundingClientRect();
    const availW = containerRect.width - 48;
    const availH = containerRect.height - 80;
    if (availW > 0 && availH > 0) {
      previewScale = Math.min(availW / pageWidthPx, availH / pageHeightPx, 1);
    }
  }

  function zoomActual() {
    zoomMode = "actual";
    previewScale = 1;
  }

  function zoomIn() {
    zoomMode = "custom";
    previewScale = Math.min(previewScale + 0.1, 3);
  }

  function zoomOut() {
    zoomMode = "custom";
    previewScale = Math.max(previewScale - 0.1, 0.1);
  }

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
      // Use the same pre-paginated chunks the preview uses. Each chunk
      // is a full HTML page - we extract just the body content, combine
      // them into a single document with break-after:page between pages,
      // so the print dialog produces the exact same pagination as the preview.
      const chunks = measuredPageChunks;
      if (!chunks.length) {
        pdfError = "No pages to export.";
        downloading = false;
        return;
      }

      // Extract the <head> from the first chunk (all chunks share the same styles)
      const firstHead = chunks[0]!.match(/<head[^>]*>([\s\S]*?)<\/head>/i)?.[1] ?? "";

      // Extract each chunk's body content AND its inline body styles.
      // The preview chunks use inline styles on <body> for flex layout,
      // padding, and min-height. We preserve those exactly.
      const pageData = chunks.map((chunk) => {
        const bodyStyleMatch = chunk.match(/<body[^>]*style="([^"]*)"/i);
        const bodyClassMatch = chunk.match(/<body[^>]*class="([^"]*)"/i);
        const bodyMatch = chunk.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
        return {
          style: bodyStyleMatch?.[1] ?? "",
          cls: bodyClassMatch?.[1] ?? "",
          content: bodyMatch?.[1] ?? "",
        };
      });

      // Build @page CSS - use the exact page dimensions.
      // The preview already measured content to fit within these bounds,
      // so the @page size must match exactly.
      const dim = pageSizes[pageSize];
      const w = orientation === "landscape" ? dim.h : dim.w;
      const h = orientation === "landscape" ? dim.w : dim.h;
      const m = marginValues[marginPreset];
      const mPx = Math.round(m * (96 / 25.4));
      const pageH = pageHeightPx;

      // Each page is a div that exactly fills one printed page.
      // The preview body had min-height:100vh - replace with the exact
      // pixel height so it matches the @page size after margins.
      // Use @page margin:0 because the preview chunks already have
      // inline padding for margins. Adding @page margin on top would
      // double the spacing and shrink the content area.
      const combinedHtml = `<!DOCTYPE html>
<html>
<head>
  ${firstHead}
  <style>
    @page { size: ${w}mm ${h}mm; margin: 0; }
    html, body { margin: 0; padding: 0; }
    .export-page {
      height: ${pageH}px;
      display: flex;
      flex-direction: column;
      box-sizing: border-box;
      overflow: hidden;
      break-after: page;
      page-break-after: always;
    }
    .export-page:last-child {
      break-after: auto;
      page-break-after: auto;
    }
  </style>
</head>
<body>
  ${pageData.map((p) => {
    const style = p.style.replace(/min-height:\s*100vh;?/g, "").replace(/margin:\s*0;?/g, "").replace(/padding:\s*0;?/g, "");
    return `<div class="export-page ${p.cls}" style="${style}">${p.content}</div>`;
  }).join("\n")}

</body>
</html>`;

      // Use a hidden iframe to print - no new tab to close.
      const iframe = document.createElement("iframe");
      iframe.style.position = "fixed";
      iframe.style.left = "-9999px";
      iframe.style.top = "0";
      iframe.style.width = `${pageWidthPx}px`;
      iframe.style.height = `${pageHeightPx}px`;
      iframe.style.border = "none";
      document.body.appendChild(iframe);

      const iframeDoc = iframe.contentDocument;
      if (!iframeDoc) {
        pdfError = "Could not create print frame.";
        document.body.removeChild(iframe);
      } else {
        iframeDoc.open();
        iframeDoc.write(combinedHtml);
        iframeDoc.close();

        // Wait for fonts then print from the iframe
        const iframeWin = iframe.contentWindow!;
        const doPrint = () => {
          iframeWin.focus();
          iframeWin.print();
          // Clean up the iframe after printing
          setTimeout(() => {
            try { document.body.removeChild(iframe); } catch { /* already removed */ }
          }, 1000);
        };

        if (iframeDoc.fonts) {
          iframeDoc.fonts.ready.then(() => setTimeout(doPrint, 300));
        } else {
          setTimeout(doPrint, 500);
        }
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

<div class="modal" role="dialog" aria-modal="true" aria-label={outputMode === "print" ? "Print" : "Download PDF"}>
  <header class="modal-header">
    <div>
      <div class="eyebrow">{outputMode === "print" ? "Print" : "Download PDF"}</div>
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
          <div class="section-label-row">
            <div class="section-label">Date range</div>
            <button type="button" class="reset-link" onclick={resetDateRange}>Reset</button>
          </div>
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
                checked={showLocationShapes}
                onchange={(e) => (showLocationShapes = e.currentTarget.checked)}
              />
              <span>Location shapes</span>
            </label>
          </div>
          <div class="section-label" style="margin-top:var(--space-3)">Color</div>
          <div class="btn-group-row">
            <button
              type="button"
              class="btn-chip"
              class:selected={colorMode === "color"}
              onclick={() => (colorMode = "color")}
            >
              Color
            </button>
            <button
              type="button"
              class="btn-chip"
              class:selected={colorMode === "bw"}
              onclick={() => (colorMode = "bw")}
            >
              Black & white
            </button>
          </div>
        </section>

        <section class="section">
          <div class="section-label">Header</div>
          <div class="toggle-grid">
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
              <span>Days of the week on all pages</span>
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
          <div class="preview-top-row">
            <div class="zoom-controls">
              <button
                type="button"
                class="zoom-btn"
                class:selected={zoomMode === "fit"}
                onclick={zoomFit}
                title="Fit to window"
              >
                Fit
              </button>
              <button
                type="button"
                class="zoom-btn"
                class:selected={zoomMode === "actual"}
                onclick={zoomActual}
                title="Actual size (100%)"
              >
                100%
              </button>
              <button
                type="button"
                class="zoom-btn zoom-icon-btn"
                onclick={zoomOut}
                title="Zoom out"
                aria-label="Zoom out"
              >&minus;</button>
              <span class="zoom-value">{Math.round(previewScale * 100)}%</span>
              <button
                type="button"
                class="zoom-btn zoom-icon-btn"
                onclick={zoomIn}
                title="Zoom in"
                aria-label="Zoom in"
              >+</button>
            </div>
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
          {#if onconvertgroups && show.groups.length > 0 && show.cast.length > 0}
            <div class="convert-row">
              <button type="button" class="btn btn-secondary btn-sm" onclick={() => onconvertgroups?.("collapse")}>
                Collapse actors into groups
              </button>
              <button type="button" class="btn btn-secondary btn-sm" onclick={() => onconvertgroups?.("expand")}>
                Expand groups into actors
              </button>
            </div>
          {/if}
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
    <button type="button" class="reset-defaults-link" onclick={resetAllSettings}>
      Reset to defaults
    </button>
    <div class="footer-right">
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
      {downloading ? "Generating..." : outputMode === "print" ? "Print" : "Download PDF"}
    </button>
    </div>
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
    padding-right: var(--space-5);
  }

  .preview-panel {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    min-height: 0;
  }

  .preview-top {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .preview-top-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    flex-wrap: wrap;
  }

  .zoom-controls {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .zoom-btn {
    font: inherit;
    font-size: 0.75rem;
    font-weight: 500;
    padding: 3px var(--space-2);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--color-text-muted);
    cursor: pointer;
    min-width: 28px;
  }
  .zoom-btn:hover {
    border-color: var(--color-text-muted);
    color: var(--color-text);
  }
  .zoom-btn.selected {
    background: var(--color-plum);
    border-color: var(--color-plum);
    color: var(--color-text-inverse);
  }
  .zoom-icon-btn {
    font-size: 0.9rem;
    line-height: 1;
    padding: 3px 8px;
  }
  .zoom-value {
    font-size: 0.75rem;
    color: var(--color-text-muted);
    min-width: 38px;
    text-align: center;
    font-variant-numeric: tabular-nums;
  }

  .convert-row {
    display: flex;
    gap: var(--space-2);
    flex-wrap: wrap;
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
    min-width: 0;
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
    width: 100%;
    box-sizing: border-box;
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
    justify-content: space-between;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-3) var(--space-5);
    border-top: 1px solid var(--color-border);
    background: var(--color-bg-alt);
  }
  .footer-right {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }
  .reset-defaults-link {
    font: inherit;
    font-size: 0.75rem;
    color: var(--color-text-muted);
    background: none;
    border: none;
    cursor: pointer;
    text-decoration: underline;
    text-underline-offset: 2px;
    padding: 0;
  }
  .reset-defaults-link:hover {
    color: var(--color-danger);
  }
  .section-label-row {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
  }
  .reset-link {
    font: inherit;
    font-size: 0.6875rem;
    color: var(--color-teal);
    background: none;
    border: none;
    cursor: pointer;
    text-decoration: underline;
    text-underline-offset: 2px;
    padding: 0;
  }
  .reset-link:hover {
    color: var(--color-teal-dark);
  }
  .btn-group-row {
    display: flex;
    gap: var(--space-1);
  }
  .btn-chip {
    font: inherit;
    font-size: 0.75rem;
    font-weight: 500;
    padding: var(--space-1) var(--space-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-full);
    background: transparent;
    color: var(--color-text-muted);
    cursor: pointer;
  }
  .btn-chip.selected {
    background: var(--color-plum);
    border-color: var(--color-plum);
    color: var(--color-text-inverse);
  }

  .pdf-error {
    color: #dc2626;
    font-size: 0.8125rem;
    margin-right: auto;
  }
</style>
