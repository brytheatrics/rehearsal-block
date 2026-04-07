/**
 * Server-side PDF generation using headless Chrome.
 *
 * Receives HTML + page settings, launches Puppeteer with a minimal
 * Chromium binary, renders the HTML, and returns a real PDF with
 * vector text and proper page breaks.
 *
 * Footers (logo, page numbers, download date) use Puppeteer's built-in
 * displayHeaderFooter + footerTemplate instead of CSS tricks, which
 * avoids known flex/min-height bugs in Puppeteer's print renderer.
 */

import { error, type RequestHandler } from "@sveltejs/kit";
import { dev } from "$app/environment";

/** Grey logo SVG for footer - must be self-contained with no external refs. */
const FOOTER_LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2159.11 307.82" height="10"><g><path fill="#c0c0c0" d="M193.15,183.97v98.55l137.13-74.51,4.69-80.76-141.81,56.72ZM288.45,164.14c-1.08,3.13-3,3.97-3,3.97l-29.68,12.86s-1.62.45-2.52-.6c-.22-.26-2.14-2.05-.24-7.21.87-2.36,4.09-4.21,4.09-4.21l28.6-11.9s1.55-.52,2.28.36c.14.16,2.1,2.02.48,6.73Z"/><polygon fill="#c0c0c0" points="42.21 127.25 46.89 208.01 184.02 282.52 184.02 183.97 42.21 127.25"/><polygon fill="#c0c0c0" points="305.16 114.03 188.59 156.69 72.01 114.03 46.89 120.76 188.59 175.92 330.28 120.76 305.16 114.03"/><path fill="#c0c0c0" d="M193.15,88.31v58.05l108.04-38.22,2.52-49.99-110.57,30.17ZM269.95,85.55c-1.08,3.13-3,3.85-3,3.85l-29.2,9.01s-2.1.21-3-.84c-.22-.26-2.14-2.29-.24-7.45.87-2.36,3.61-3.37,3.61-3.37l28-8.17s2.15-.64,2.88.24c.14.16,2.58,2.02.96,6.73Z"/><polygon fill="#c0c0c0" points="73.45 58.15 75.98 108.14 184.02 146.36 184.02 88.31 73.45 58.15"/><polygon fill="#c0c0c0" points="188.59 31.71 77.78 52.02 188.59 81.22 299.39 52.02 188.59 31.71"/><text fill="#c0c0c0" font-family="'Century Gothic',sans-serif" font-weight="700" font-size="200" transform="translate(1479.92 217.96)">BLOCK</text><text fill="#c0c0c0" font-family="'Century Gothic',sans-serif" font-size="200" transform="translate(363.35 217.96)">REHEARSAL</text></g></svg>`;

interface PdfRequest {
  html: string;
  pageSize: "letter" | "a4" | "legal" | "tabloid";
  orientation: "landscape" | "portrait";
  marginMm: number;
  scale: number;
  printBackground: boolean;
  filename: string;
  /** "download" saves the file, "inline" opens in the browser's PDF viewer. */
  disposition?: "download" | "inline";
  showFooterLogo?: boolean;
  showPageNumbers?: boolean;
  showDownloadDate?: boolean;
  repeatTitle?: boolean;
  showName?: string;
  showRunDates?: string;
  fontHeading?: string;
}

/** Web-safe fonts that don't need a Google Fonts link. */
const WEB_SAFE_FONTS = new Set(["Georgia", "Garamond", "system-ui", "'Century Gothic', sans-serif"]);

function buildGoogleFontsTag(fonts: string[]): string {
  const needed = fonts.filter((f) => f && !WEB_SAFE_FONTS.has(f));
  if (needed.length === 0) return "";
  const families = needed
    .map((f) => `family=${encodeURIComponent(f)}:wght@400;600;700`)
    .join("&");
  return `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?${families}&display=swap">`;
}

function buildHeaderTemplate(opts: PdfRequest): string {
  if (!opts.repeatTitle || !opts.showName) return "<span></span>";
  const name = opts.showName;
  const dates = opts.showRunDates ?? "";
  const headingFont = opts.fontHeading ?? "Playfair Display";
  const fontsTag = buildGoogleFontsTag([headingFont]);
  return `${fontsTag}
  <div style="display:flex;align-items:baseline;justify-content:space-between;margin:0 auto;width:calc(100% - 4mm);border-bottom:3px solid #38817D;padding-bottom:8px;font-family:'${headingFont}',Georgia,serif">
    <span style="font-size:18px;font-weight:700;color:#2d1f3d">${name}</span>
    ${dates ? `<span style="font-size:9px;color:#6b7280;font-family:system-ui,sans-serif">${dates}</span>` : ""}
  </div>`;
}

function buildFooterTemplate(opts: PdfRequest): string {
  const parts: string[] = [];

  if (opts.showFooterLogo) {
    parts.push(`<span style="flex:1;text-align:left">${FOOTER_LOGO_SVG}</span>`);
  } else {
    parts.push(`<span style="flex:1"></span>`);
  }

  if (opts.showPageNumbers) {
    parts.push(`<span style="flex:1;text-align:center;font-size:7px;color:#c0c0c0">Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>`);
  } else {
    parts.push(`<span style="flex:1"></span>`);
  }

  if (opts.showDownloadDate) {
    const now = new Date();
    const dateStr = now.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
    parts.push(`<span style="flex:1;text-align:right;font-size:7px;color:#c0c0c0">Downloaded ${dateStr}</span>`);
  } else {
    parts.push(`<span style="flex:1"></span>`);
  }

  return `<div style="width:100%;display:flex;align-items:center;padding:0 10mm;font-family:sans-serif;border-top:1px solid #e5e7eb;margin:0 10mm">${parts.join("")}</div>`;
}

export const POST: RequestHandler = async ({ request }) => {
  const body = (await request.json()) as PdfRequest;

  if (!body.html || body.html.length > 500_000) {
    return error(400, "Invalid or oversized HTML payload");
  }

  const hasFooter = body.showFooterLogo || body.showPageNumbers || body.showDownloadDate;

  let browser;
  try {
    if (dev) {
      const puppeteer = await import("puppeteer-core");
      const paths = [
        "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
        "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
        process.env.CHROME_PATH,
      ].filter(Boolean) as string[];

      let executablePath: string | undefined;
      for (const p of paths) {
        try {
          const fs = await import("fs");
          if (fs.existsSync(p)) { executablePath = p; break; }
        } catch { continue; }
      }

      if (!executablePath) {
        return error(500, "Chrome not found. Set CHROME_PATH environment variable.");
      }

      browser = await puppeteer.default.launch({
        executablePath,
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      });
    } else {
      const [puppeteer, chromium] = await Promise.all([
        import("puppeteer-core"),
        import("@sparticuz/chromium-min"),
      ]);

      browser = await puppeteer.default.launch({
        args: chromium.default.args,
        executablePath: await chromium.default.executablePath(
          "https://github.com/nicoreed/chromium/releases/download/v143.0.4/chromium-v143.0.4-pack.tar",
        ),
        headless: true,
      });
    }

    const page = await browser.newPage();

    // Strip CSS @page rules and .page-footer elements from the HTML.
    // Puppeteer's own header/footer templates handle these reliably.
    let html = body.html
      .replace(/@page\s*\{[^}]+\}/g, "")
      .replace(/<div class="page-footer">[\s\S]*?<\/div>/g, "");

    // When repeatTitle is on, Puppeteer's headerTemplate handles the title
    // on every page. Strip the HTML .print-header so it doesn't double up.
    if (body.repeatTitle && body.showName) {
      html = html.replace(/<div class="print-header">[\s\S]*?<\/div>/, "");
    }

    // Inject basic body reset
    html = html.replace("</head>", `<style>body{margin:0!important;padding:0!important}</style></head>`);

    await page.setContent(html, {
      waitUntil: "networkidle0",
      timeout: 15_000,
    });

    const m = body.marginMm ?? 10;
    const margin = `${m}mm`;
    const hasRepeatTitle = !!(body.repeatTitle && body.showName);
    const useHeaderFooter = hasFooter || hasRepeatTitle;
    // Extra margins for header/footer areas
    const topMargin = hasRepeatTitle ? `${m + 12}mm` : margin;
    const bottomMargin = hasFooter ? `${m + 8}mm` : margin;

    // Puppeteer's scale option (0.1 to 2.0) scales the content
    // while respecting page breaks, unlike CSS transform which overflows.
    const pdfScale = Math.max(0.1, Math.min(2.0, (body.scale ?? 100) / 100));

    const pdfBuffer = await page.pdf({
      format: body.pageSize ?? "letter",
      landscape: body.orientation === "landscape",
      margin: { top: topMargin, right: margin, bottom: bottomMargin, left: margin },
      printBackground: body.printBackground !== false,
      preferCSSPageSize: false,
      scale: pdfScale,
      displayHeaderFooter: useHeaderFooter,
      headerTemplate: hasRepeatTitle ? buildHeaderTemplate(body) : "<span></span>",
      footerTemplate: hasFooter ? buildFooterTemplate(body) : "<span></span>",
    });

    await browser.close();

    const filename = (body.filename ?? "Schedule.pdf").replace(/[^a-zA-Z0-9._-]/g, "_");
    const disposition = body.disposition === "inline" ? "inline" : "attachment";

    return new Response(pdfBuffer as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${disposition}; filename="${filename}"`,
        "Cache-Control": "no-cache",
      },
    });
  } catch (err) {
    if (browser) {
      try { await browser.close(); } catch { /* ignore */ }
    }
    console.error("PDF generation failed:", err);
    return error(500, "PDF generation failed. Please try again.");
  }
};
