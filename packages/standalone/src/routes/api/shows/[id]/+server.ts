/**
 * GET/PUT/DELETE /api/shows/[id]
 *
 * GET  - Load a show (metadata from Supabase + document from R2)
 * PUT  - Save a show (gzipped body -> R2, metadata update in Supabase)
 *        Includes daily version snapshots and per-user rate limiting.
 * DELETE - Remove a show (R2 + Supabase)
 */

import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import pako from "pako";
import type { ScheduleDoc } from "@rehearsal-block/core";
import { r2 } from "$lib/storage/r2-server.js";
import { getShowMeta, updateShowMeta, deleteShowMeta, logShowActivity } from "$lib/storage/supabase.js";
import { supabaseAdmin } from "$lib/supabase/admin.js";

// ---- Rate limiting (in-memory LRU) ----
const RATE_LIMIT_MS = 10_000;
const lastSaveMap = new Map<string, number>();

function checkRateLimit(userId: string, showId: string): boolean {
  const key = `${userId}:${showId}`;
  const now = Date.now();
  const last = lastSaveMap.get(key);

  if (last && now - last < RATE_LIMIT_MS) {
    return false; // rate limited
  }

  lastSaveMap.set(key, now);

  // Prune old entries to prevent memory leak
  if (lastSaveMap.size > 1000) {
    const cutoff = now - RATE_LIMIT_MS * 2;
    for (const [k, v] of lastSaveMap) {
      if (v < cutoff) lastSaveMap.delete(k);
    }
  }

  return true;
}

// ---- GET: Load a show ----

export const GET: RequestHandler = async ({ params, locals }) => {
  const user = locals.user;
  if (!user) throw error(401, "Not authenticated");

  const showId = params.id;

  // Verify ownership via metadata
  const meta = await getShowMeta(supabaseAdmin, showId);
  if (!meta || meta.owner_id !== user.id) {
    throw error(404, "Show not found");
  }

  // Fetch document from R2
  const r2Key = `show:${user.id}:${showId}`;
  const gzipped = await r2.get(r2Key);

  if (!gzipped) {
    throw error(404, "Show document not found in storage");
  }

  // Decompress
  const docJson = pako.ungzip(gzipped, { to: "string" });
  const document: ScheduleDoc = JSON.parse(docJson);

  return json({
    id: meta.id,
    name: meta.name,
    updatedAt: meta.updated_at,
    document,
  });
};

// ---- PUT: Save a show ----

export const PUT: RequestHandler = async ({ params, request, locals }) => {
  const user = locals.user;
  if (!user) throw error(401, "Not authenticated");

  const showId = params.id;

  // Rate limit
  if (!checkRateLimit(user.id, showId)) {
    throw error(429, "Too many saves. Please wait a moment.");
  }

  // Verify ownership
  const meta = await getShowMeta(supabaseAdmin, showId);
  if (!meta || meta.owner_id !== user.id) {
    throw error(404, "Show not found");
  }

  // Read gzipped body
  const gzipped = new Uint8Array(await request.arrayBuffer());

  // Compute hash
  const hashBuffer = await crypto.subtle.digest("SHA-256", gzipped);
  const hash = Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  // Hash guard: skip if unchanged
  if (meta.document_hash === hash) {
    return json({ ok: true, unchanged: true });
  }

  const r2Key = `show:${user.id}:${showId}`;

  // Daily version snapshot: if last_saved_at is from a prior calendar day,
  // copy the current blob to a dated snapshot before overwriting.
  if (meta.last_saved_at) {
    const clientTimezone = request.headers.get("x-timezone") ?? "America/New_York";
    const lastSavedDate = new Date(meta.last_saved_at).toLocaleDateString("en-CA", {
      timeZone: clientTimezone,
    });
    const todayDate = new Date().toLocaleDateString("en-CA", { timeZone: clientTimezone });

    if (lastSavedDate !== todayDate) {
      // First save of a new day - snapshot yesterday's version
      const snapshotKey = `snapshots/${user.id}/${showId}/${lastSavedDate}.json.gz`;
      try {
        await r2.copy(r2Key, snapshotKey);
      } catch {
        // Non-fatal: snapshot failure shouldn't block the save
      }
    }
  }

  // Write gzipped doc to R2
  await r2.put(r2Key, gzipped);

  // Decompress to extract metadata
  const docJson = pako.ungzip(gzipped, { to: "string" });
  const document: ScheduleDoc = JSON.parse(docJson);

  // Update metadata
  await updateShowMeta(supabaseAdmin, showId, {
    name: document.show.name,
    start_date: document.show.startDate ?? null,
    end_date: document.show.endDate ?? null,
    cast_count: document.cast.length,
    document_hash: hash,
    document_size_bytes: gzipped.length,
    doc_version: document.version,
    last_saved_at: new Date().toISOString(),
  });

  return json({ ok: true });
};

// ---- DELETE: Remove a show ----

export const DELETE: RequestHandler = async ({ params, locals }) => {
  const user = locals.user;
  if (!user) throw error(401, "Not authenticated");

  const showId = params.id;

  // Verify ownership
  const meta = await getShowMeta(supabaseAdmin, showId);
  if (!meta || meta.owner_id !== user.id) {
    throw error(404, "Show not found");
  }

  // Log activity before deletion (cascade will remove activity rows)
  await logShowActivity(supabaseAdmin, {
    show_id: showId,
    user_id: user.id,
    action: "deleted",
  });

  // Delete from R2
  const r2Key = `show:${user.id}:${showId}`;
  await r2.delete(r2Key);

  // Delete metadata (cascades to show_activity)
  await deleteShowMeta(supabaseAdmin, showId);

  return json({ ok: true });
};
