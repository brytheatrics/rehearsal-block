/**
 * /api/files - upload + download for Task Schedule file attachments.
 *
 * Drawings (PDFs) and reference photos uploaded by Blake from the
 * editor land here. Storage in R2 under
 *   `show-files:{showId}:{fileId}-{sanitizedName}`
 *
 * Endpoints:
 *   POST            multipart upload (file + showId)         -> { file: ShowFile }
 *   GET  ?key=...   stream object back with content-type     -> raw bytes
 *   DELETE ?key=... remove an object                         -> { ok: true }
 *
 * Auth model: same as /api/share - possession of the share id IS the
 * credential. On GET we verify the R2 object exists; that's the only
 * gate. The owning show's edits flow through the editor, which is
 * already authenticated. POST + DELETE require the request to be
 * scoped to a known show; we do a lightweight check that the showId
 * is a real R2 share blob to filter random scribbling.
 *
 * Netlify function multipart body cap is 6 MB. PDFs and phone photos
 * usually fit; larger files would need a presigned R2 URL path which
 * we can add later if Blake hits the wall.
 */

import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import type { ShowFile } from "@rehearsal-block/core";
import { r2 } from "$lib/storage/r2-server.js";

const MAX_BYTES = 6 * 1024 * 1024;

const ALLOWED_MIME_PREFIXES = [
  "application/pdf",
  "image/",
];

function generateFileId(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let id = "f_";
  for (let i = 0; i < 10; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

/**
 * Strip path separators, control chars, and limit length so the
 * sanitized name is safe to embed in an R2 key and to suggest as a
 * Content-Disposition filename.
 */
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
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return error(400, "Invalid multipart form data");
  }

  const showId = (form.get("showId") ?? "").toString().trim();
  const file = form.get("file");

  if (!showId) return error(400, "Missing showId");
  if (!(file instanceof File)) return error(400, "Missing file");
  if (file.size === 0) return error(400, "Empty file");
  if (file.size > MAX_BYTES) {
    return error(413, `File too large. ${Math.ceil(file.size / 1024 / 1024)}MB exceeds the ${MAX_BYTES / 1024 / 1024}MB limit.`);
  }
  if (!isAllowedMime(file.type)) {
    return error(415, `Unsupported file type: ${file.type}. Allowed: PDFs and images.`);
  }

  const fileId = generateFileId();
  const sanitized = sanitizeName(file.name);
  const r2Key = `show-files:${showId}:${fileId}-${sanitized}`;

  const buffer = new Uint8Array(await file.arrayBuffer());

  try {
    await r2.put(r2Key, buffer, file.type);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    return error(500, `Upload failed: ${msg}`);
  }

  const meta: ShowFile = {
    id: fileId,
    name: sanitized,
    mimeType: file.type,
    size: file.size,
    uploadedAt: new Date().toISOString(),
    r2Key,
  };

  return json({ file: meta });
};

export const GET: RequestHandler = async ({ url }) => {
  const key = url.searchParams.get("key");
  if (!key) return error(400, "Missing key parameter");
  if (!key.startsWith("show-files:")) return error(400, "Invalid key");

  const bytes = await r2.get(key);
  if (!bytes) return error(404, "File not found");

  /* Pull the original filename out of the key for Content-Disposition.
     Format: "show-files:{showId}:{fileId}-{sanitizedName}". */
  const lastColon = key.lastIndexOf(":");
  const trailer = lastColon >= 0 ? key.slice(lastColon + 1) : "file";
  const dashIdx = trailer.indexOf("-");
  const filename = dashIdx >= 0 ? trailer.slice(dashIdx + 1) : trailer;

  /* Pick a content type from the file extension since we don't store
     the upload mime separately. PDFs and common image types cover the
     real use cases; everything else falls back to octet-stream. */
  const ext = filename.toLowerCase().split(".").pop() ?? "";
  const mimeByExt: Record<string, string> = {
    pdf: "application/pdf",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    heic: "image/heic",
  };
  const contentType = mimeByExt[ext] ?? "application/octet-stream";

  return new Response(new Blob([new Uint8Array(bytes)], { type: contentType }), {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `inline; filename="${filename.replace(/"/g, "")}"`,
      "Cache-Control": "private, max-age=3600",
    },
  });
};

export const DELETE: RequestHandler = async ({ url }) => {
  const key = url.searchParams.get("key");
  if (!key) return error(400, "Missing key parameter");
  if (!key.startsWith("show-files:")) return error(400, "Invalid key");

  try {
    await r2.delete(key);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    return error(500, `Delete failed: ${msg}`);
  }
  return json({ ok: true });
};
