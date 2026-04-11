/**
 * Debug harness for contact sheet DOCX export.
 *
 * Generates a .docx via the same code path the browser uses, then converts
 * it to PDF via Word COM automation (headless), then to PNG via Chrome
 * (so we get real font rendering, not pdfjs-dist's broken fallback).
 *
 * Usage:
 *   pnpm exec tsx scripts/debug-contact-docx.mts [size]
 *
 * size: "small" (default) or "large"
 */

import { sampleShow } from "@rehearsal-block/core";
import type { ScheduleDoc, CastMember, CrewMember } from "@rehearsal-block/core";
import { buildContactSheetDocxBuffer } from "../src/lib/export-docx.js";
import { spawnSync } from "node:child_process";
import { writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const OUT_DIR = path.resolve("scripts/out");

const size = (process.argv[2] as "small" | "large" | undefined) ?? "small";

async function main(): Promise<void> {
  if (!existsSync(OUT_DIR)) await mkdir(OUT_DIR, { recursive: true });

  const doc = buildDoc(size);
  console.log(`[debug] size=${size} cast=${doc.cast.length} crew=${doc.crew.length}`);

  // 1. Write the DOCX
  const docxBytes = await buildContactSheetDocxBuffer(doc, { includeCast: true, includeCrew: true });
  const docxPath = path.join(OUT_DIR, `docx-${size}.docx`);
  await writeFile(docxPath, docxBytes);
  console.log(`[debug] wrote ${docxPath} (${docxBytes.byteLength} bytes)`);

  // 2. Convert DOCX → PDF via Word COM
  const pdfPath = path.join(OUT_DIR, `docx-${size}.pdf`);
  const ps = `
$ErrorActionPreference = "Stop"
$word = $null
try {
  $word = New-Object -ComObject Word.Application
  $word.Visible = $false
  $doc = $word.Documents.Open("${docxPath.replace(/\\/g, "\\\\")}", $false, $true)
  $doc.SaveAs([ref]"${pdfPath.replace(/\\/g, "\\\\")}", [ref]17)
  $doc.Close($false)
} finally {
  if ($word) { $word.Quit() }
}
Write-Output "ok"
`.trim();

  const result = spawnSync("powershell.exe", ["-NoProfile", "-Command", ps], {
    encoding: "utf8",
    timeout: 60_000,
  });
  if (result.status !== 0) {
    console.error("[debug] Word COM conversion failed:");
    console.error("  stdout:", result.stdout);
    console.error("  stderr:", result.stderr);
    process.exit(1);
  }
  console.log(`[debug] wrote ${pdfPath}`);

  // Screenshot each page via Chrome's built-in PDF viewer.
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
    const numPages = size === "large" ? 3 : 1;
    for (let i = 1; i <= numPages; i++) {
      const page = await browser.newPage();
      await page.setViewport({ width: 1400, height: 1700, deviceScaleFactor: 2 });
      await page.goto(`${fileUrl}#page=${i}&zoom=page-fit`, { waitUntil: "networkidle2", timeout: 15_000 });
      await new Promise((r) => setTimeout(r, 1500));
      const outPath = path.resolve(OUT_DIR, `docx-${size}-page-${i}.png`);
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
