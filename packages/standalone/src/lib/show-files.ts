/**
 * Client-side helpers for the Task Schedule file-attachment feature.
 * Wraps the /api/files endpoints so editor + carpenter-share components
 * don't repeat fetch boilerplate.
 */

import type { ShowFile } from "@rehearsal-block/core";

/**
 * Upload a single file. Returns the server-assigned metadata or
 * throws with a user-readable message on failure. Caller is
 * responsible for appending the result to `doc.files`.
 */
export async function uploadShowFile(showId: string, file: File): Promise<ShowFile> {
  const form = new FormData();
  form.append("showId", showId);
  form.append("file", file);
  const res = await fetch("/api/files", { method: "POST", body: form });
  if (!res.ok) {
    let msg = "Upload failed";
    try {
      const body = await res.json();
      if (body?.message) msg = body.message;
    } catch { /* leave default */ }
    throw new Error(msg);
  }
  const body = await res.json();
  return body.file as ShowFile;
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
