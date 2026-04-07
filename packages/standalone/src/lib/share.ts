/**
 * Schedule sharing utilities.
 *
 * Two modes:
 * - Server-stored (stable link): POST to /api/share, get back an ID.
 *   URL is /view?id=abc123 - never changes, always shows latest data.
 * - Hash-encoded (fallback): data compressed into URL fragment.
 *   URL changes every time the data changes.
 */

import LZString from "lz-string";
const { compressToEncodedURIComponent, decompressFromEncodedURIComponent } = LZString;
import type { ScheduleDoc } from "@rehearsal-block/core";

// ---- Hash-encoded (fallback) ----

export function encodeSchedule(doc: ScheduleDoc): string {
  const json = JSON.stringify(doc);
  return compressToEncodedURIComponent(json);
}

export function decodeSchedule(encoded: string): ScheduleDoc | null {
  try {
    const json = decompressFromEncodedURIComponent(encoded);
    if (!json) return null;
    const doc = JSON.parse(json) as ScheduleDoc;
    if (!doc.show || !doc.cast || !doc.schedule) return null;
    return doc;
  } catch {
    return null;
  }
}

// ---- Server-stored (stable link) ----

/**
 * Publish a schedule to the server. If an existing shareId is provided,
 * updates in place so the URL stays the same. Returns the share ID.
 */
export async function publishSchedule(
  doc: ScheduleDoc,
  existingId?: string | null,
): Promise<string> {
  const res = await fetch("/api/share", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ doc, id: existingId }),
  });
  if (!res.ok) throw new Error("Failed to publish schedule");
  const data = await res.json();
  return data.id as string;
}

/**
 * Build a stable share URL from a share ID.
 */
export function buildShareUrlFromId(id: string, origin: string): string {
  return `${origin}/view?id=${id}`;
}
