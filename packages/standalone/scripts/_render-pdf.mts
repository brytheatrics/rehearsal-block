/**
 * Render a PDF page to a high-DPI PNG using pdfjs-dist + @napi-rs/canvas.
 * Usage: pnpm exec tsx scripts/_render-pdf.mts <pdfPath> <pngPath> [scale]
 *
 * Standard PDF fonts may render with odd spacing in Node, but layout
 * (line positions, text placement) is correct.
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const canvasUrl = pathToFileURL(
  path.resolve(
    "../../node_modules/.pnpm/@napi-rs+canvas@0.1.97/node_modules/@napi-rs/canvas/index.js",
  ),
).href;
// @ts-expect-error - dynamic import
const { createCanvas } = await import(canvasUrl);

const pdfjsUrl = pathToFileURL(
  path.resolve(
    "../../node_modules/.pnpm/pdfjs-dist@5.4.624/node_modules/pdfjs-dist/legacy/build/pdf.mjs",
  ),
).href;
// @ts-expect-error - dynamic import
const pdfjsLib = await import(pdfjsUrl);

const pdfPath = path.resolve(process.argv[2]);
const pngPath = path.resolve(process.argv[3]);
const scale = parseFloat(process.argv[4] ?? "3");

const data = new Uint8Array(await readFile(pdfPath));
const loadingTask = pdfjsLib.getDocument({
  data,
  disableFontFace: true,
  useSystemFonts: false,
});
const pdf = await loadingTask.promise;
const page = await pdf.getPage(1);
const viewport = page.getViewport({ scale });

const canvas = createCanvas(viewport.width, viewport.height);
const ctx = canvas.getContext("2d");
ctx.fillStyle = "white";
ctx.fillRect(0, 0, viewport.width, viewport.height);

// pdfjs expects a web-ish canvas context
await page.render({
  canvasContext: ctx as unknown as CanvasRenderingContext2D,
  viewport,
  // @ts-expect-error - option exists at runtime
  canvasFactory: undefined,
}).promise;

const png = await canvas.encode("png");
await writeFile(pngPath, png);
console.log(`wrote ${pngPath} (${viewport.width}x${viewport.height})`);

// Also write a tight crop of the first 3 cast rows for easy inspection
const cropArgs = process.argv.slice(5); // x y w h
if (cropArgs.length === 4) {
  const [cx, cy, cw, ch] = cropArgs.map(Number);
  const cropCanvas = createCanvas(cw, ch);
  const cropCtx = cropCanvas.getContext("2d");
  cropCtx.drawImage(canvas as unknown as CanvasImageSource, -cx, -cy);
  const cropPng = await cropCanvas.encode("png");
  const cropPath = pngPath.replace(/\.png$/, "-crop.png");
  await writeFile(cropPath, cropPng);
  console.log(`wrote ${cropPath} (${cw}x${ch})`);
}
