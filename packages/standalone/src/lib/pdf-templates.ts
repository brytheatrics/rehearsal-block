/**
 * Shared HTML builders for the calendar PDF header + footer.
 *
 * The server (`/api/pdf` endpoint) uses these as Puppeteer
 * `headerTemplate` / `footerTemplate` strings, which Chromium renders
 * separately in the page margins. The export modal preview iframe
 * uses the SAME functions to render an in-body header/footer that
 * visually matches the downloaded PDF, so the user sees an accurate
 * preview of what they'll get.
 *
 * Constraints (Chrome's printToPDF context):
 *   - The header/footer template must be a single root element. Multiple
 *     top-level nodes can trigger "Printing failed" CDP errors in some
 *     Chromium versions.
 *   - External resources (Google Fonts <link>, etc) are NOT fetched in
 *     the template's isolated context, so we use only system-ui /
 *     Georgia. The header is small enough that the show title still
 *     reads cleanly without the brand display font.
 *   - All styles must be inline. The template is rendered without the
 *     body's stylesheet.
 */

/** Grey logo SVG used in the page footer. Self-contained, no external refs. */
export const FOOTER_LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2159.11 307.82" height="10"><g><path fill="#c0c0c0" d="M193.15,183.97v98.55l137.13-74.51,4.69-80.76-141.81,56.72ZM288.45,164.14c-1.08,3.13-3,3.97-3,3.97l-29.68,12.86s-1.62.45-2.52-.6c-.22-.26-2.14-2.05-.24-7.21.87-2.36,4.09-4.21,4.09-4.21l28.6-11.9s1.55-.52,2.28.36c.14.16,2.1,2.02.48,6.73Z"/><polygon fill="#c0c0c0" points="42.21 127.25 46.89 208.01 184.02 282.52 184.02 183.97 42.21 127.25"/><polygon fill="#c0c0c0" points="305.16 114.03 188.59 156.69 72.01 114.03 46.89 120.76 188.59 175.92 330.28 120.76 305.16 114.03"/><path fill="#c0c0c0" d="M193.15,88.31v58.05l108.04-38.22,2.52-49.99-110.57,30.17ZM269.95,85.55c-1.08,3.13-3,3.85-3,3.85l-29.2,9.01s-2.1.21-3-.84c-.22-.26-2.14-2.29-.24-7.45.87-2.36,3.61-3.37,3.61-3.37l28-8.17s2.15-.64,2.88.24c.14.16,2.58,2.02.96,6.73Z"/><polygon fill="#c0c0c0" points="73.45 58.15 75.98 108.14 184.02 146.36 184.02 88.31 73.45 58.15"/><polygon fill="#c0c0c0" points="188.59 31.71 77.78 52.02 188.59 81.22 299.39 52.02 188.59 31.71"/><text fill="#c0c0c0" font-family="'Century Gothic',sans-serif" font-weight="700" font-size="200" transform="translate(1479.92 217.96)">BLOCK</text><text fill="#c0c0c0" font-family="'Century Gothic',sans-serif" font-size="200" transform="translate(363.35 217.96)">REHEARSAL</text></g></svg>`;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface PdfHeaderOptions {
  repeatTitle?: boolean;
  showName?: string;
  showRunDates?: string;
}

export interface PdfFooterOptions {
  showFooterLogo?: boolean;
  showPageNumbers?: boolean;
  showDownloadDate?: boolean;
  /** Show "BETA - Rehearsal Block" watermark in the footer. */
  beta?: boolean;
}

/** Builds the PDF header template HTML. Returns "<span></span>" when
 *  the title-on-all-pages option is off (Puppeteer needs a non-empty
 *  template even when there's no header). */
export function buildPdfHeaderHtml(opts: PdfHeaderOptions): string {
  if (!opts.repeatTitle || !opts.showName) return "<span></span>";
  const name = escapeHtml(opts.showName);
  const dates = opts.showRunDates ? escapeHtml(opts.showRunDates) : "";
  return `<div style="width:100%;font-family:Georgia,serif;padding:0 10mm">
    <div style="display:flex;align-items:baseline;justify-content:space-between;border-bottom:3px solid #4b5563;padding-bottom:6px">
      <span style="font-size:14px;font-weight:700;color:#2d1f3d">${name}</span>
      ${dates ? `<span style="font-size:8px;color:#6b7280;font-family:system-ui,sans-serif">${dates}</span>` : ""}
    </div>
  </div>`;
}

/** Builds the PDF footer template HTML. Used by Puppeteer's footerTemplate
 *  on the server side, where the literal page numbers are filled in by
 *  Chrome via the special <span class="pageNumber"></span> markup.
 *
 *  The optional `pageNum` / `totalPages` arguments are used by the
 *  modal preview to render concrete numbers (since the preview iframe
 *  doesn't have Chrome's special class substitution). */
export function buildPdfFooterHtml(
  opts: PdfFooterOptions,
  pageNum?: number,
  totalPages?: number,
): string {
  const parts: string[] = [];

  if (opts.showFooterLogo) {
    parts.push(`<span style="flex:1;text-align:left">${FOOTER_LOGO_SVG}</span>`);
  } else {
    parts.push(`<span style="flex:1"></span>`);
  }

  if (opts.showPageNumbers) {
    const pageMarkup =
      pageNum !== undefined && totalPages !== undefined
        ? `Page ${pageNum} of ${totalPages}`
        : `Page <span class="pageNumber"></span> of <span class="totalPages"></span>`;
    parts.push(
      `<span style="flex:1;text-align:center;font-size:7px;color:#c0c0c0">${pageMarkup}</span>`,
    );
  } else {
    parts.push(`<span style="flex:1"></span>`);
  }

  if (opts.showDownloadDate || opts.beta) {
    const segments: string[] = [];
    if (opts.showDownloadDate) {
      const now = new Date();
      const dateStr = now.toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      });
      segments.push(`Downloaded ${dateStr}`);
    }
    if (opts.beta) segments.push("BETA - Rehearsal Block");
    parts.push(
      `<span style="flex:1;text-align:right;font-size:7px;color:#c0c0c0">${segments.join(" · ")}</span>`,
    );
  } else {
    parts.push(`<span style="flex:1"></span>`);
  }

  return `<div style="width:100%;display:flex;align-items:center;padding:0 10mm;font-family:sans-serif;border-top:1px solid #e5e7eb;margin:0 10mm">${parts.join("")}</div>`;
}

/** True when any footer element is enabled. */
export function hasPdfFooter(opts: PdfFooterOptions): boolean {
  return Boolean(opts.showFooterLogo || opts.showPageNumbers || opts.showDownloadDate || opts.beta);
}
