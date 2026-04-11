/**
 * Debug helper for the calendar PDF endpoint.
 *
 * Posts the demo show through buildPrintHtml -> /api/pdf with various
 * scale values, saves each PDF, and renders every page to PNG so the
 * pagination + header/footer behavior can be inspected without going
 * through the browser export modal.
 *
 * Requires the dev server running on http://localhost:5173.
 *
 * Usage:
 *   pnpm exec tsx scripts/debug-calendar-pdf.mts [scale1] [scale2] ...
 *   pnpm exec tsx scripts/debug-calendar-pdf.mts 100 150 200
 *
 * Output goes to scripts/out/calendar-{scale}-page-{n}.png
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { buildPrintHtml, sampleShow } from "@rehearsal-block/core";

const MONOREPO_ROOT = path.resolve("../..");
const OUT_DIR = path.resolve("scripts/out");

const canvasUrl = pathToFileURL(
  path.join(
    MONOREPO_ROOT,
    "node_modules/.pnpm/@napi-rs+canvas@0.1.97/node_modules/@napi-rs/canvas/index.js",
  ),
).href;
// @ts-expect-error - dynamic import
const { createCanvas } = await import(canvasUrl);

const pdfjsUrl = pathToFileURL(
  path.join(
    MONOREPO_ROOT,
    "node_modules/.pnpm/pdfjs-dist@5.4.624/node_modules/pdfjs-dist/legacy/build/pdf.mjs",
  ),
).href;
// @ts-expect-error - dynamic import
const pdfjsLib = await import(pdfjsUrl);

await mkdir(OUT_DIR, { recursive: true });

const scales = (process.argv.slice(2).length > 0
  ? process.argv.slice(2)
  : ["100", "150"]
).map((s) => parseInt(s, 10));

const doc = sampleShow;

const baseOpts = {
  startDate: doc.show.startDate,
  endDate: doc.show.endDate,
  pageBreaks: "continuous" as const,
  showRunDates: true,
  showFooterLogo: true,
  showPageNumbers: true,
  showDownloadDate: true,
  printBackgrounds: true,
  action: "pdf" as const,
};

const modes: Array<{ label: string; mode: "calendar" | "list"; orientation: "landscape" | "portrait" }> = [
  { label: "calendar", mode: "calendar", orientation: "landscape" },
  { label: "list", mode: "list", orientation: "portrait" },
];

for (const { label, mode, orientation } of modes) {
for (const scale of scales) {
  console.log(`\n=== ${label} scale ${scale}% ===`);

  const html = buildPrintHtml(doc, { ...baseOpts, mode });
  console.log(`built HTML (${html.length} bytes)`);

  const res = await fetch("http://localhost:5173/api/pdf", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      html,
      pageSize: "letter",
      orientation,
      marginMm: 10,
      scale,
      printBackground: true,
      filename: `debug-${label}-${scale}.pdf`,
      disposition: "inline",
      showFooterLogo: true,
      showPageNumbers: true,
      showDownloadDate: true,
      repeatTitle: true,
      showName: doc.show.name,
      showRunDates: "May 4 - Jun 14, 2026",
      fontHeading: doc.settings.fontHeading ?? "Playfair Display",
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "unknown");
    console.error(`server returned ${res.status}: ${err}`);
    continue;
  }

  const buf = new Uint8Array(await res.arrayBuffer());
  const pdfPath = path.join(OUT_DIR, `${label}-${scale}.pdf`);
  await writeFile(pdfPath, buf);
  console.log(`wrote ${pdfPath} (${buf.length} bytes)`);

  // Render every page to PNG
  const loadingTask = pdfjsLib.getDocument({
    data: buf,
    disableFontFace: true,
    useSystemFonts: false,
  });
  const pdf = await loadingTask.promise;
  console.log(`PDF has ${pdf.numPages} page(s)`);

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = createCanvas(viewport.width, viewport.height);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, viewport.width, viewport.height);

    await page.render({
      canvasContext: ctx as unknown as CanvasRenderingContext2D,
      viewport,
      // @ts-expect-error - option exists at runtime
      canvasFactory: undefined,
    }).promise;

    const png = await canvas.encode("png");
    const pngPath = path.join(
      OUT_DIR,
      `${label}-${scale}-page-${i}.png`,
    );
    await writeFile(pngPath, png);
    console.log(
      `  page ${i}: ${pngPath} (${Math.round(viewport.width)}x${Math.round(viewport.height)})`,
    );
  }

  await loadingTask.destroy?.();
}
}

console.log("\ndone.");
