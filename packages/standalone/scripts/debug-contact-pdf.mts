/**
 * Debug harness for contact sheet PDF export.
 *
 * Renders a contact sheet through the production code path
 * (renderContactSheetPdf) to a PDF on disk, then takes a screenshot of
 * each page using Puppeteer's built-in PDF viewer (real Chrome, not
 * pdfjs-dist) so the output can be visually inspected.
 *
 * Usage:
 *   pnpm exec tsx scripts/debug-contact-pdf.mts [size]
 *
 * size: "small" (default, 8 cast + 7 crew) or "large" (40 cast + 20 crew)
 *
 * Output: scripts/out/pdfkit-{size}.pdf and scripts/out/pdfkit-{size}-page-N.png
 *
 * Note: pdf-to-png-converter is intentionally NOT used here because
 * pdfjs-dist in Node cannot resolve the standard 14 PDF fonts (Times,
 * Helvetica, etc.) and renders text with broken letter spacing. Real
 * PDF viewers (Chrome, Adobe) handle these fonts correctly.
 */

import { sampleShow } from "@rehearsal-block/core";
import type { ScheduleDoc, CastMember, CrewMember } from "@rehearsal-block/core";
import { renderContactSheetPdf } from "../src/lib/contact-sheet-pdf.js";
import { writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve as pathResolve } from "node:path";
import { pathToFileURL } from "node:url";

const OUT_DIR = pathResolve("scripts/out");

const size = (process.argv[2] as "small" | "large" | undefined) ?? "small";

async function main(): Promise<void> {
  if (!existsSync(OUT_DIR)) await mkdir(OUT_DIR, { recursive: true });

  const doc = buildDoc(size);
  console.log(`[debug] size=${size} cast=${doc.cast.length} crew=${doc.crew.length}`);

  const pdfBytes = await renderContactSheetPdf(doc, { includeCast: true, includeCrew: true });
  const pdfPath = pathResolve(OUT_DIR, `pdfkit-${size}.pdf`);
  await writeFile(pdfPath, pdfBytes);
  console.log(`[debug] wrote ${pdfPath} (${pdfBytes.byteLength} bytes)`);

  // Open the PDF in Chrome's built-in viewer and screenshot each page.
  // This bypasses pdfjs-dist's broken standard-font fallback in Node.
  const puppeteer = await import("puppeteer-core");
  const candidates = [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    process.env.CHROME_PATH,
  ].filter(Boolean) as string[];
  let exe: string | undefined;
  for (const p of candidates) if (existsSync(p)) { exe = p; break; }
  if (!exe) throw new Error("Chrome not found");

  const browser = await puppeteer.default.launch({
    executablePath: exe,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const fileUrl = pathToFileURL(pdfPath).toString();
    // 1 page for small, 2 for large is enough to see what's going on
    const numPages = size === "large" ? 2 : 1;
    for (let i = 1; i <= numPages; i++) {
      const page = await browser.newPage();
      await page.setViewport({ width: 1400, height: 1700, deviceScaleFactor: 2 });
      await page.goto(`${fileUrl}#page=${i}&zoom=page-fit`, { waitUntil: "networkidle2", timeout: 15_000 });
      await new Promise((r) => setTimeout(r, 1500));
      const outPath = pathResolve(OUT_DIR, `pdfkit-${size}-page-${i}.png`);
      await page.screenshot({ path: outPath, fullPage: false });
      console.log(`[debug] wrote ${outPath}`);
      await page.close();
    }
  } finally {
    await browser.close();
  }
}

function buildDoc(size: "small" | "large"): ScheduleDoc {
  if (size === "small") return sampleShow;

  const cast: CastMember[] = [];
  for (let i = 0; i < 40; i++) {
    cast.push({
      id: `bigcast-${i}`,
      firstName: `Firstname${i}`,
      middleName: i % 3 === 0 ? `Middle${i}` : undefined,
      lastName: `Longlastname${i}`,
      suffix: i % 10 === 0 ? "Jr." : undefined,
      character: `Character Role ${i}`,
      pronouns: i % 2 === 0 ? "he/him" : "she/her",
      phone: i % 3 === 0 ? `555-0${100 + i}` : undefined,
      email: i % 2 === 0 ? `actor${i}@example-theatre.com` : undefined,
      color: "#1565c0",
    });
  }

  const crew: CrewMember[] = [];
  for (let i = 0; i < 20; i++) {
    crew.push({
      id: `bigcrew-${i}`,
      firstName: `Crew${i}`,
      lastName: `Member${i}`,
      role: `Department Role ${i}`,
      pronouns: i % 3 === 0 ? "they/them" : undefined,
      phone: `555-1${100 + i}`,
      email: `crew${i}@example-theatre.com`,
      color: "#00695c",
    });
  }

  return { ...sampleShow, cast, crew };
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
