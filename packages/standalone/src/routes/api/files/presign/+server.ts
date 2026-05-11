/**
 * /api/files/presign - issue a presigned R2 PUT URL so the browser
 * uploads file bytes directly to R2, bypassing the 6 MB Netlify
 * function multipart body cap.
 *
 * The client:
 *   1. POSTs { showId, filename, mimeType } here, gets back
 *      { uploadUrl, file: ShowFile }.
 *   2. PUTs the file body to `uploadUrl`. The URL is signed for the
 *      specific key + contentType, so the browser can't reuse it.
 *   3. Adds the returned ShowFile metadata to doc.files via the
 *      editor's normal save loop.
 *
 * No body capacity here - just a small JSON request. Real bytes flow
 * direct to R2.
 */

import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import type { ShowFile } from "@rehearsal-block/core";
import { r2 } from "$lib/storage/r2-server.js";

const MAX_BYTES = 100 * 1024 * 1024; // 100 MB upper bound. Phones rarely produce larger.
const ALLOWED_MIME_PREFIXES = ["application/pdf", "image/"];

function generateFileId(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let id = "f_";
  for (let i = 0; i < 10; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

function sanitizeName(raw: string): string {
  const stripped = raw
    .replace(/[\\/]/g, "")
    .replace(/[\x00-\x1f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return stripped.slice(0, 80) || "file";
}

function isAllowedMime(mime: string): boolean {
  return ALLOWED_MIME_PREFIXES.some((p) => mime === p || mime.startsWith(p));
}

export const POST: RequestHandler = async ({ request }) => {
  const body = await request.json().catch(() => null);
  const showId = typeof body?.showId === "string" ? body.showId.trim() : "";
  const filename = typeof body?.filename === "string" ? body.filename : "";
  const mimeType = typeof body?.mimeType === "string" ? body.mimeType : "";
  const size = typeof body?.size === "number" ? body.size : 0;

  if (!showId) return error(400, "Missing showId");
  if (!filename) return error(400, "Missing filename");
  if (!mimeType) return error(400, "Missing mimeType");
  if (!isAllowedMime(mimeType)) return error(415, `Unsupported file type: ${mimeType}. Allowed: PDFs and images.`);
  if (size <= 0) return error(400, "Invalid size");
  if (size > MAX_BYTES) {
    return error(413, `File too large. ${Math.ceil(size / 1024 / 1024)}MB exceeds the ${MAX_BYTES / 1024 / 1024}MB limit.`);
  }

  const fileId = generateFileId();
  const sanitized = sanitizeName(filename);
  const r2Key = `show-files:${showId}:${fileId}-${sanitized}`;

  let uploadUrl: string;
  try {
    uploadUrl = await r2.presignPut(r2Key, mimeType);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    return error(500, `Could not generate upload URL: ${msg}`);
  }

  const meta: ShowFile = {
    id: fileId,
    name: sanitized,
    mimeType,
    size,
    uploadedAt: new Date().toISOString(),
    r2Key,
  };

  return json({ uploadUrl, file: meta });
};
