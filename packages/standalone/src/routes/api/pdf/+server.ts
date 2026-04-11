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
import { buildPdfHeaderHtml, buildPdfFooterHtml, hasPdfFooter } from "$lib/pdf-templates";

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

export const POST: RequestHandler = async ({ request }) => {
  const body = (await request.json()) as PdfRequest;

  if (!body.html || body.html.length > 500_000) {
    return error(400, "Invalid or oversized HTML payload");
  }

  const hasFooter = hasPdfFooter(body);

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
        args: [...chromium.default.args, "--disable-dev-shm-usage", "--disable-gpu", "--single-process"],
        executablePath: await chromium.default.executablePath(
          "https://github.com/Sparticuz/chromium/releases/download/v143.0.4/chromium-v143.0.4-pack.x64.tar",
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
    //
    // Why a custom strip instead of a non-greedy regex: .print-header
    // contains a nested `<div class="dates">` when showRunDates is on
    // (the default), and a non-greedy `[\s\S]*?</div>` would match the
    // first `</div>` (the dates closer), leaving the actual print-header
    // closing `</div>` orphaned in the body HTML. That malformed HTML
    // makes Puppeteer fall over with "PDF generation failed". Walking
    // div depth properly handles any number of nested children.
    if (body.repeatTitle && body.showName) {
      const startMarker = '<div class="print-header">';
      const startIdx = html.indexOf(startMarker);
      if (startIdx >= 0) {
        let depth = 1;
        let i = startIdx + startMarker.length;
        while (i < html.length && depth > 0) {
          const nextOpen = html.indexOf("<div", i);
          const nextClose = html.indexOf("</div>", i);
          if (nextClose < 0) break;
          if (nextOpen >= 0 && nextOpen < nextClose) {
            depth++;
            i = nextOpen + 4;
          } else {
            depth--;
            i = nextClose + 6;
          }
        }
        if (depth === 0) {
          html = html.slice(0, startIdx) + html.slice(i);
        }
      }
    }

    // User-driven scale (1.0 = 100%). Clamped to a safe range. We
    // apply this via CSS `zoom` on the inner `.page-content` element
    // ONLY - NOT on the body and NOT via Puppeteer's page.pdf scale
    // option.
    //
    // Why .page-content specifically: the body contains three things -
    //   1. .print-header (the show title row, first page only)
    //   2. .print-page > .page-content (the calendar/list grid)
    //   3. .print-page > .page-footer (stripped further down so
    //      Puppeteer's footerTemplate renders the footer in the
    //      bottom margin instead)
    // Zooming the body scales the title and bleeds the grid into the
    // footer's margin reservation, visually pushing the footer off
    // the page. Zooming only .page-content leaves the title and
    // footer at their natural size while the grid grows - which is
    // exactly the user's intent ("make my calendar cells bigger").
    const userScale = Math.max(0.1, Math.min(2.0, (body.scale ?? 100) / 100));

    // Scale via regex rewrite of every `font-size: Npx` in the
    // embedded <style> block, plus a proportional min-height bump on
    // .day-cell. After scaling, we restore the .print-header font
    // sizes back to their natural values so the show title at the top
    // of page 1 stays the same size regardless of user scale. The
    // page footer is rendered separately by Puppeteer's footerTemplate
    // so it never sees this CSS.
    //
    // Why this approach instead of CSS zoom or Puppeteer's scale:
    //   - CSS zoom interacts badly with `page-break-inside: avoid` on
    //     .week-row, causing Chromium to put just one row per page
    //   - Puppeteer's page.pdf({scale}) scales body content but doesn't
    //     expand the bottom margin reservation, so the body bleeds
    //     into the footer area and visually pushes the footer off the
    //     page
    // Plain font-size scaling lets cells grow naturally (the .week-row
    // grid auto-sizes to the tallest cell) and Chromium's normal page
    // break algorithm splits week rows across pages without surprises.
    //
    // We also override .print-page from display:flex to block - the
    // source uses flex so the in-body .page-footer can be pushed to
    // the bottom via margin-top:auto, but we strip those footers
    // below and let Puppeteer's footerTemplate render the footer in
    // the bottom margin instead, so the flex would just keep
    // .print-page glued together as one unbreakable block.
    const s = userScale;
    if (s !== 1) {
      // Rewrite every `font-size: Npx` in the embedded <style> tag.
      html = html.replace(
        /(<style[^>]*>)([\s\S]*?)(<\/style>)/,
        (_match, open, css, close) => {
          const scaled = css.replace(
            /font-size:\s*(\d+(?:\.\d+)?)px/g,
            (_m: string, px: string) =>
              `font-size:${(parseFloat(px) * s).toFixed(2)}px`,
          );
          return open + scaled + close;
        },
      );
    }

    // Body reset + structural overrides + (when scaling) min-height
    // bump on day cells + restore .print-header sizes to original.
    const cellHeightOverride =
      s !== 1
        ? `.day-cell{min-height:${(70 * s).toFixed(0)}px}`
        : "";
    const headerRestore =
      s !== 1
        ? `.print-header h1{font-size:22px}.print-header .dates{font-size:11px}`
        : "";
    html = html.replace(
      "</head>",
      `<style>body{margin:0!important;padding:0!important}.print-page{display:block!important}.page-content{flex:none!important}${cellHeightOverride}${headerRestore}</style></head>`,
    );

    // Use networkidle2 (allows 2 outstanding connections) instead of
    // networkidle0 to reduce memory/time waiting for all resources.
    // Fonts typically load within the first few connections.
    await page.setContent(html, {
      waitUntil: "networkidle2",
      timeout: 10_000,
    });

    const m = body.marginMm ?? 10;
    const margin = `${m}mm`;
    const hasRepeatTitle = !!(body.repeatTitle && body.showName);
    const useHeaderFooter = hasFooter || hasRepeatTitle;
    // Extra margins for header/footer areas
    const topMargin = hasRepeatTitle ? `${m + 12}mm` : margin;
    const bottomMargin = hasFooter ? `${m + 8}mm` : margin;

    const pdfBuffer = await page.pdf({
      format: body.pageSize ?? "letter",
      landscape: body.orientation === "landscape",
      margin: { top: topMargin, right: margin, bottom: bottomMargin, left: margin },
      printBackground: body.printBackground !== false,
      preferCSSPageSize: false,
      // scale: 1 (default) - we apply user scale via CSS zoom above
      displayHeaderFooter: useHeaderFooter,
      headerTemplate: hasRepeatTitle ? buildPdfHeaderHtml(body) : "<span></span>",
      footerTemplate: hasFooter ? buildPdfFooterHtml(body) : "<span></span>",
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
