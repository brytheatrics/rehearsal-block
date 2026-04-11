import puppeteer from "puppeteer-core";
import path from "node:path";
import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";

const candidates = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
];
const exe = candidates.find((p) => existsSync(p));
if (!exe) throw new Error("Chrome not found");

const pdfRel = process.argv[2] ?? "scripts/out/pdfkit-small.pdf";
const outRel = process.argv[3] ?? "scripts/out/pdfkit-small-zoom.png";
const zoom = process.argv[4] ?? "200";

const browser = await puppeteer.launch({
  executablePath: exe,
  headless: true,
  args: ["--no-sandbox"],
});
const page = await browser.newPage();
// Huge viewport so Chrome's page-fit renders the PDF at high pixel density
await page.setViewport({ width: 3400, height: 4400, deviceScaleFactor: 1 });
const pdfPath = path.resolve(pdfRel);
await page.goto(`${pathToFileURL(pdfPath)}#page=1&zoom=page-fit`, {
  waitUntil: "networkidle2",
  timeout: 15_000,
});
await new Promise((r) => setTimeout(r, 2000));
await page.screenshot({
  path: path.resolve(outRel),
  fullPage: false,
});
await browser.close();
console.log(`wrote ${outRel}`);
