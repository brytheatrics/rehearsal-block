/**
 * Server-side contact sheet PDF renderer.
 *
 * Uses pdfkit to draw the PDF directly at exact coordinates, bypassing
 * Puppeteer's print engine entirely. This fixes the inconsistent
 * row-divider line thickness bug that plagued the HTML/Chrome approach
 * (sub-pixel rasterization of 1px borders at varying integer Y positions).
 *
 * Lines drawn via doc.moveTo().lineTo().stroke() at integer PDF coordinates
 * with a fixed lineWidth render uniformly because they're vector primitives,
 * not CSS borders.
 *
 * Visual design matches the existing HTML export:
 *   - left-aligned serif title
 *   - muted subtitle (run dates)
 *   - section headers in bold uppercase with letter-spacing
 *   - column header row with thick black underline
 *   - data rows with thin grey underline between them
 *
 * Pagination: when a row would overflow the page bottom margin, a new page
 * is started and the column header row is repeated at the top so it stays
 * readable mid-section.
 */

import PDFDocument from "pdfkit";
import type { ScheduleDoc, CastMember, CrewMember } from "@rehearsal-block/core";
import { formatUsDateRange } from "@rehearsal-block/core";

export interface ContactSheetPdfOptions {
  includeCast: boolean;
  includeCrew: boolean;
}

// -------------------------------------------------------------------
// Layout constants (PDF points - 72/inch)
// -------------------------------------------------------------------

// US Letter
const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;

// Margins: match /api/pdf default of 10mm = 28.35pt, rounded to 36pt for a
// slightly more comfortable gutter since there's no header/footer.
const MARGIN_TOP = 40;
const MARGIN_BOTTOM = 40;
const MARGIN_LEFT = 40;
const MARGIN_RIGHT = 40;

const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT; // 532
const PAGE_BOTTOM = PAGE_HEIGHT - MARGIN_BOTTOM; // 752

// Typography
const TITLE_SIZE = 24;
const SUBTITLE_SIZE = 11;
const SECTION_SIZE = 9.5;
const HEADER_SIZE = 8;
const ROW_SIZE = 9.5;

// Row heights (tight but readable)
const TITLE_HEIGHT = TITLE_SIZE * 1.15;
const SUBTITLE_HEIGHT = SUBTITLE_SIZE * 1.2;
const SECTION_HEIGHT = SECTION_SIZE * 1.4;
const HEADER_ROW_HEIGHT = HEADER_SIZE * 2; // 16
const DATA_ROW_HEIGHT = ROW_SIZE * 2; // 19

// Line weights
const HEADER_RULE_WIDTH = 1.25; // thick rule under column header
const ROW_RULE_WIDTH = 0.5; // thin rule between data rows

// Colors
const COLOR_TEXT = "#1a1a1a";
const COLOR_MUTED = "#6b7280";
const COLOR_RULE_HEADER = "#9ca3af";
const COLOR_RULE_ROW = "#d8d9db";

// Columns (fractions of content width, 5 columns)
// Order: Name, Character/Role, Pronouns, Phone, Email
// Pronouns slice is sized so the "PRONOUNS" column header itself fits.
// Phone gets enough room for "(253) 202-6194"-style formatted numbers.
const COL_FRACTIONS = [0.21, 0.21, 0.12, 0.17, 0.29]; // 1.00
const COL_PADDING = 5;

interface ColumnSpec {
  label: string;
  /** Key for data row: either a literal string or a function of the member. */
  getCast?: (m: CastMember) => string;
  getCrew?: (m: CrewMember) => string;
}

// -------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------

function fullName(m: { firstName: string; middleName?: string; lastName: string; suffix?: string }): string {
  return [m.firstName, m.middleName, m.lastName].filter(Boolean).join(" ") + (m.suffix ? `, ${m.suffix}` : "");
}

function colX(i: number): number {
  let x = MARGIN_LEFT;
  for (let j = 0; j < i; j++) x += COL_FRACTIONS[j] * CONTENT_WIDTH;
  return x;
}

function colWidth(i: number): number {
  return COL_FRACTIONS[i] * CONTENT_WIDTH;
}

/**
 * Draw a horizontal rule at the specified Y using pdfkit's vector line drawing.
 * This is the key to fixing the line thickness bug: vector lines render at
 * their exact specified width, unlike CSS borders which sub-pixel rasterize.
 */
function hRule(pdf: PDFKit.PDFDocument, y: number, weight: number, color: string): void {
  pdf
    .save()
    .lineWidth(weight)
    .strokeColor(color)
    .moveTo(MARGIN_LEFT, y)
    .lineTo(MARGIN_LEFT + CONTENT_WIDTH, y)
    .stroke()
    .restore();
}

/**
 * Draw text inside a column cell at the given baseline Y.
 * Truncates with ellipsis if it doesn't fit in the column width.
 */
function cellText(
  pdf: PDFKit.PDFDocument,
  text: string,
  colIndex: number,
  y: number,
  font: string,
  size: number,
  color: string,
): void {
  const x = colX(colIndex) + COL_PADDING;
  const w = colWidth(colIndex) - COL_PADDING * 2;
  pdf
    .font(font)
    .fontSize(size)
    .fillColor(color)
    .text(text || "", x, y, {
      width: w,
      height: size * 1.3,
      ellipsis: true,
      lineBreak: false,
    });
}

// -------------------------------------------------------------------
// Main renderer
// -------------------------------------------------------------------

export function renderContactSheetPdf(
  doc: ScheduleDoc,
  opts: ContactSheetPdfOptions,
): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const pdf = new PDFDocument({
      size: "LETTER",
      margins: { top: MARGIN_TOP, bottom: MARGIN_BOTTOM, left: MARGIN_LEFT, right: MARGIN_RIGHT },
      autoFirstPage: true,
      bufferPages: false,
      info: {
        Title: `${doc.show.name || "Untitled Show"} - Contact Sheet`,
        Creator: "Rehearsal Block",
      },
    });

    const chunks: Buffer[] = [];
    pdf.on("data", (c: Buffer) => chunks.push(c));
    pdf.on("end", () => resolve(new Uint8Array(Buffer.concat(chunks))));
    pdf.on("error", reject);

    try {
      drawDocument(pdf, doc, opts);
      pdf.end();
    } catch (err) {
      reject(err as Error);
    }
  });
}

function drawDocument(
  pdf: PDFKit.PDFDocument,
  doc: ScheduleDoc,
  opts: ContactSheetPdfOptions,
): void {
  const showName = doc.show.name || "Untitled Show";
  const dates = formatUsDateRange(doc.show.startDate, doc.show.endDate);

  // --- Title + subtitle (only on first page) ---
  let y = MARGIN_TOP;

  pdf
    .font("Times-Bold")
    .fontSize(TITLE_SIZE)
    .fillColor(COLOR_TEXT)
    .text(`${showName}: Contact Sheet`, MARGIN_LEFT, y, {
      width: CONTENT_WIDTH,
      lineBreak: false,
    });
  y += TITLE_HEIGHT;

  pdf
    .font("Helvetica")
    .fontSize(SUBTITLE_SIZE)
    .fillColor(COLOR_MUTED)
    .text(dates, MARGIN_LEFT, y, {
      width: CONTENT_WIDTH,
      lineBreak: false,
    });
  y += SUBTITLE_HEIGHT + 18;

  // --- Sections ---
  const castColumns: ColumnSpec[] = [
    { label: "Name", getCast: (m) => fullName(m) },
    { label: "Character", getCast: (m) => m.character ?? "" },
    { label: "Pronouns", getCast: (m) => m.pronouns ?? "" },
    { label: "Phone", getCast: (m) => m.phone ?? "" },
    { label: "Email", getCast: (m) => m.email ?? "" },
  ];

  const crewColumns: ColumnSpec[] = [
    { label: "Name", getCrew: (m) => fullName(m) },
    { label: "Role", getCrew: (m) => m.role ?? "" },
    { label: "Pronouns", getCrew: (m) => m.pronouns ?? "" },
    { label: "Phone", getCrew: (m) => m.phone ?? "" },
    { label: "Email", getCrew: (m) => m.email ?? "" },
  ];

  if (opts.includeCast && doc.cast.length > 0) {
    y = drawSection<CastMember>(pdf, "CAST", castColumns, doc.cast, "cast", y);
    y += 18; // gap before next section
  }

  if (opts.includeCrew && doc.crew.length > 0) {
    y = drawSection<CrewMember>(pdf, "PRODUCTION TEAM", crewColumns, doc.crew, "crew", y);
  }
}

/**
 * Draw a section (title + header row + data rows) starting at `startY`.
 * Returns the Y coordinate just below the last row drawn.
 * Handles page breaks mid-section by repeating the column header row on
 * each new page.
 */
function drawSection<T extends CastMember | CrewMember>(
  pdf: PDFKit.PDFDocument,
  sectionTitle: string,
  columns: ColumnSpec[],
  members: T[],
  kind: "cast" | "crew",
  startY: number,
): number {
  let y = startY;

  // If the section title + column header + at least one row won't fit,
  // start a new page.
  const minBlockHeight = SECTION_HEIGHT + HEADER_ROW_HEIGHT + DATA_ROW_HEIGHT + 6;
  if (y + minBlockHeight > PAGE_BOTTOM) {
    pdf.addPage();
    y = MARGIN_TOP;
  }

  // Section heading
  y = drawSectionHeading(pdf, sectionTitle, y);

  // Column header row + its rule
  y = drawColumnHeaderRow(pdf, columns, y);

  // Data rows
  for (const m of members) {
    // Page break before this row?
    if (y + DATA_ROW_HEIGHT > PAGE_BOTTOM) {
      pdf.addPage();
      y = MARGIN_TOP;
      // Re-draw a compact "(continued)" section marker + header row
      y = drawSectionHeading(pdf, `${sectionTitle} (continued)`, y);
      y = drawColumnHeaderRow(pdf, columns, y);
    }

    // Vertically center text's visual mass between the row's top and bottom
    // rules. pdfkit places the top of the em-box at textY, but Helvetica's
    // visible glyph mass is offset below that (short descenders), so a raw
    // (rowHeight - fontSize)/2 lands the text too high. Empirical nudge of
    // +0.75pt puts the x-height midpoint on the row's vertical center.
    const textY = y + (DATA_ROW_HEIGHT - ROW_SIZE) / 2 + 0.75;
    for (let i = 0; i < columns.length; i++) {
      const col = columns[i];
      const value =
        kind === "cast" && col.getCast
          ? col.getCast(m as CastMember)
          : kind === "crew" && col.getCrew
            ? col.getCrew(m as CrewMember)
            : "";
      cellText(pdf, value, i, textY, "Helvetica", ROW_SIZE, COLOR_TEXT);
    }

    // Rule at the bottom of this row - integer coordinate to avoid any
    // sub-pixel nudges the PDF viewer might do.
    const ruleY = Math.round(y + DATA_ROW_HEIGHT) + 0.5;
    hRule(pdf, ruleY, ROW_RULE_WIDTH, COLOR_RULE_ROW);

    y += DATA_ROW_HEIGHT;
  }

  return y;
}

function drawSectionHeading(
  pdf: PDFKit.PDFDocument,
  title: string,
  y: number,
): number {
  pdf
    .font("Helvetica-Bold")
    .fontSize(SECTION_SIZE)
    .fillColor(COLOR_TEXT)
    .text(title, MARGIN_LEFT, y, {
      width: CONTENT_WIDTH,
      characterSpacing: 0.8,
      lineBreak: false,
    });
  return y + SECTION_HEIGHT + 4;
}

function drawColumnHeaderRow(
  pdf: PDFKit.PDFDocument,
  columns: ColumnSpec[],
  y: number,
): number {
  const textY = y + (HEADER_ROW_HEIGHT - HEADER_SIZE) / 2 - 1;
  for (let i = 0; i < columns.length; i++) {
    const x = colX(i) + COL_PADDING;
    const w = colWidth(i) - COL_PADDING * 2;
    pdf
      .font("Helvetica-Bold")
      .fontSize(HEADER_SIZE)
      .fillColor(COLOR_TEXT)
      .text(columns[i].label.toUpperCase(), x, textY, {
        width: w,
        lineBreak: false,
      });
  }
  const ruleY = Math.round(y + HEADER_ROW_HEIGHT) + 0.5;
  hRule(pdf, ruleY, HEADER_RULE_WIDTH, COLOR_RULE_HEADER);
  return y + HEADER_ROW_HEIGHT + 4;
}
