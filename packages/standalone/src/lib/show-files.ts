/**
 * Client-side helpers for the Task Schedule file-attachment feature.
 * Wraps the /api/files endpoints so editor + carpenter-share components
 * don't repeat fetch boilerplate.
 */

import type { ShowFile } from "@rehearsal-block/core";

/**
 * Upload a single file via the presigned-URL flow. The browser POSTs
 * a small JSON request to /api/files/presign to get a signed R2 URL,
 * then PUTs the file bytes directly to that URL - bypassing the
 * 6 MB Netlify function multipart body limit.
 *
 * Returns the server-assigned ShowFile metadata. The caller appends
 * it to doc.files; the next auto-save propagates everywhere.
 */
export async function uploadShowFile(showId: string, file: File): Promise<ShowFile> {
  /* 1. Ask the server for a presigned URL. */
  const presignRes = await fetch("/api/files/presign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      showId,
      filename: file.name,
      mimeType: file.type,
      size: file.size,
    }),
  });
  if (!presignRes.ok) {
    let msg = "Upload failed";
    try {
      const body = await presignRes.json();
      if (body?.message) msg = body.message;
    } catch { /* leave default */ }
    throw new Error(msg);
  }
  const { uploadUrl, file: meta } = (await presignRes.json()) as { uploadUrl: string; file: ShowFile };

  /* 2. PUT the actual bytes directly to R2. Browser → R2, no
        function in the middle, no 6 MB cap. */
  const putRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": file.type },
    body: file,
  });
  if (!putRes.ok) {
    throw new Error(`R2 upload failed (${putRes.status})`);
  }

  return meta;
}

/**
 * URL for opening / downloading a file from the editor or share view.
 * The endpoint streams the bytes with the right Content-Type so
 * browsers display PDFs / images inline and download other types.
 */
export function showFileUrl(file: ShowFile): string {
  return `/api/files?key=${encodeURIComponent(file.r2Key)}`;
}

export async function deleteShowFile(file: ShowFile): Promise<void> {
  const res = await fetch(`/api/files?key=${encodeURIComponent(file.r2Key)}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    let msg = "Delete failed";
    try {
      const body = await res.json();
      if (body?.message) msg = body.message;
    } catch { /* leave default */ }
    throw new Error(msg);
  }
}

/**
 * Format a file size for display ("1.2 MB", "340 KB"). Used in the
 * sidebar Drawings list so Blake can spot a giant accidental upload.
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
