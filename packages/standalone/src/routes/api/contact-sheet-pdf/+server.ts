/**
 * Server-side contact sheet PDF endpoint.
 *
 * Unlike /api/pdf (which runs Puppeteer on HTML for the calendar export),
 * this endpoint uses pdfkit to draw the contact sheet directly. pdfkit
 * runs as pure Node and does not need Chromium, which means:
 *   - no 1024MB Netlify function memory limit concern
 *   - uniform line thicknesses (lines are vector primitives, not CSS borders)
 *   - much smaller PDF output (~3KB vs ~65KB)
 *
 * Accepts a minimal payload of what the renderer actually needs - not
 * the full ScheduleDoc - to keep request size down.
 */

import { error, type RequestHandler } from "@sveltejs/kit";
import { renderContactSheetPdf } from "$lib/contact-sheet-pdf.js";
import type { ScheduleDoc } from "@rehearsal-block/core";

interface ContactSheetPdfRequest {
  doc: ScheduleDoc;
  includeCast: boolean;
  includeCrew: boolean;
  filename?: string;
  disposition?: "download" | "inline";
}

export const POST: RequestHandler = async ({ request }) => {
  let body: ContactSheetPdfRequest;
  try {
    body = (await request.json()) as ContactSheetPdfRequest;
  } catch {
    return error(400, "Invalid JSON body");
  }

  if (!body?.doc || typeof body.doc !== "object") {
    return error(400, "Missing doc in request body");
  }
  if (!Array.isArray(body.doc.cast) || !Array.isArray(body.doc.crew)) {
    return error(400, "doc.cast and doc.crew are required arrays");
  }

  try {
    const pdfBytes = await renderContactSheetPdf(body.doc, {
      includeCast: body.includeCast !== false,
      includeCrew: body.includeCrew !== false,
    });

    const filename = (body.filename ?? "Contact_Sheet.pdf").replace(/[^a-zA-Z0-9._-]/g, "_");
    const disposition = body.disposition === "inline" ? "inline" : "attachment";

    return new Response(pdfBytes as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${disposition}; filename="${filename}"`,
        "Cache-Control": "no-cache",
      },
    });
  } catch (err) {
    console.error("Contact sheet PDF generation failed:", err);
    return error(500, "PDF generation failed. Please try again.");
  }
};
