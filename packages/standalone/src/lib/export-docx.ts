/**
 * DOCX contact sheet generator.
 *
 * Produces a Word document with cast and/or production team tables
 * that can be edited in Google Docs, Word, or LibreOffice.
 *
 * Visual design tries to match the PDF export:
 *   - left-aligned serif title (Georgia)
 *   - muted subtitle (run dates)
 *   - section headers in bold uppercase
 *   - table with no outer borders, no vertical borders
 *   - header row with a thick black bottom rule
 *   - data rows with a thin grey bottom rule
 */

import {
  Document,
  Paragraph,
  Table,
  TableRow,
  TableCell,
  TextRun,
  WidthType,
  BorderStyle,
  HeadingLevel,
  Packer,
} from "docx";
import type { ScheduleDoc } from "@rehearsal-block/core";
import { formatUsDateRange } from "@rehearsal-block/core";

interface ContactSheetOptions {
  includeCast: boolean;
  includeCrew: boolean;
}

function fullName(m: { firstName: string; middleName?: string; lastName: string; suffix?: string }): string {
  return [m.firstName, m.middleName, m.lastName].filter(Boolean).join(" ") + (m.suffix ? `, ${m.suffix}` : "");
}

// Column order: Name, Character/Role, Pronouns, Phone, Email
// Column widths in DXA (twentieths of a point). Letter is 12240 DXA wide,
// minus 2x720 (0.5 inch) margins = 10800 DXA content area. Same proportions
// as the PDF renderer (21/21/12/17/29). Pronouns is sized so the "PRONOUNS"
// header itself fits without squishing up against the next column.
const PAGE_MARGIN_DXA = 720; // 0.5 inch
const COL_WIDTHS = [2300, 2300, 1300, 1800, 3100]; // Name, Character/Role, Pronouns, Phone, Email

// DOCX border "size" is in eighths of a point: size 8 = 1pt, size 4 = 0.5pt.
const HEADER_RULE_SIZE = 8;
const ROW_RULE_SIZE = 4;

const COLOR_TEXT = "1a1a1a";
const COLOR_MUTED = "6b7280";
const COLOR_RULE_HEADER = "9ca3af";
const COLOR_RULE_ROW = "d8d9db";

const noSideBorders = {
  top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
};

function headerCell(text: string, widthDxa: number): TableCell {
  return new TableCell({
    width: { size: widthDxa, type: WidthType.DXA },
    children: [
      new Paragraph({
        spacing: { before: 60, after: 60 },
        children: [
          new TextRun({
            text: text.toUpperCase(),
            bold: true,
            size: 16, // 8pt
            font: "Arial",
            color: COLOR_TEXT,
          }),
        ],
      }),
    ],
    borders: {
      ...noSideBorders,
      bottom: { style: BorderStyle.SINGLE, size: HEADER_RULE_SIZE, color: COLOR_RULE_HEADER },
    },
  });
}

function dataCell(text: string, widthDxa: number): TableCell {
  return new TableCell({
    width: { size: widthDxa, type: WidthType.DXA },
    children: [
      new Paragraph({
        spacing: { before: 80, after: 80 },
        children: [
          new TextRun({
            text,
            size: 19, // 9.5pt
            font: "Arial",
            color: COLOR_TEXT,
          }),
        ],
      }),
    ],
    borders: {
      ...noSideBorders,
      bottom: { style: BorderStyle.SINGLE, size: ROW_RULE_SIZE, color: COLOR_RULE_ROW },
    },
  });
}

function buildTable(headers: string[], rows: string[][]): Table {
  return new Table({
    width: { size: 10800, type: WidthType.DXA },
    columnWidths: COL_WIDTHS,
    rows: [
      new TableRow({
        children: headers.map((h, i) => headerCell(h, COL_WIDTHS[i])),
        tableHeader: true,
      }),
      ...rows.map(
        (row) =>
          new TableRow({
            children: row.map((cell, i) => dataCell(cell, COL_WIDTHS[i])),
          }),
      ),
    ],
  });
}

function buildContactSheetDocument(doc: ScheduleDoc, opts: ContactSheetOptions): Document {
  const showName = doc.show.name || "Untitled Show";
  const dates = formatUsDateRange(doc.show.startDate, doc.show.endDate);
  const children: (Paragraph | Table)[] = [];

  // Title: serif, bold, 24pt
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: `${showName}: Contact Sheet`,
          bold: true,
          size: 48, // 24pt
          font: "Georgia",
          color: COLOR_TEXT,
        }),
      ],
      heading: HeadingLevel.HEADING_1,
      spacing: { after: 60 },
    }),
  );

  // Subtitle: date range, muted
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: dates,
          size: 22, // 11pt
          color: COLOR_MUTED,
          font: "Arial",
        }),
      ],
      spacing: { after: 400 },
    }),
  );

  if (opts.includeCast && doc.cast.length > 0) {
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: "CAST",
            bold: true,
            size: 19, // 9.5pt
            font: "Arial",
            color: COLOR_TEXT,
            characterSpacing: 16, // 0.8pt in 20ths
          }),
        ],
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 200, after: 80 },
      }),
    );
    children.push(
      buildTable(
        ["Name", "Character", "Pronouns", "Phone", "Email"],
        doc.cast.map((m) => [
          fullName(m),
          m.character ?? "",
          m.pronouns ?? "",
          m.phone ?? "",
          m.email ?? "",
        ]),
      ),
    );
  }

  if (opts.includeCrew && doc.crew.length > 0) {
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: "PRODUCTION TEAM",
            bold: true,
            size: 19, // 9.5pt
            font: "Arial",
            color: COLOR_TEXT,
            characterSpacing: 16,
          }),
        ],
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 400, after: 80 },
      }),
    );
    children.push(
      buildTable(
        ["Name", "Role", "Pronouns", "Phone", "Email"],
        doc.crew.map((m) => [
          fullName(m),
          m.role ?? "",
          m.pronouns ?? "",
          m.phone ?? "",
          m.email ?? "",
        ]),
      ),
    );
  }

  return new Document({
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: PAGE_MARGIN_DXA,
              right: PAGE_MARGIN_DXA,
              bottom: PAGE_MARGIN_DXA,
              left: PAGE_MARGIN_DXA,
            },
          },
        },
        children,
      },
    ],
  });
}

export async function buildContactSheetDocx(
  doc: ScheduleDoc,
  opts: ContactSheetOptions,
): Promise<Blob> {
  return await Packer.toBlob(buildContactSheetDocument(doc, opts));
}

export async function downloadContactSheetDocx(
  doc: ScheduleDoc,
  opts: ContactSheetOptions,
): Promise<void> {
  const blob = await buildContactSheetDocx(doc, opts);
  const url = URL.createObjectURL(blob);
  const a = window.document.createElement("a");
  a.href = url;
  a.download = (doc.show.name || "Show").replace(/\s+/g, "_") + "_Contact_Sheet.docx";
  window.document.body.appendChild(a);
  a.click();
  window.document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Node-only helper used by the debug harness to write a .docx straight to
 * disk without going through the browser download path.
 */
export async function buildContactSheetDocxBuffer(
  doc: ScheduleDoc,
  opts: ContactSheetOptions,
): Promise<Uint8Array> {
  return new Uint8Array(await Packer.toBuffer(buildContactSheetDocument(doc, opts)));
}
