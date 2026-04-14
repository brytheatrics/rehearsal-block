/**
 * POST /api/shows/[id]/restore
 *
 * Body: { date: "YYYY-MM-DD" }
 *
 * Restores a show from a daily snapshot. Copies the snapshot blob
 * back to the main show key (creating today's snapshot of the
 * current version first so the user can undo the restore), updates
 * shows_index metadata, and logs a restored_from_snapshot activity.
 *
 * Returns the restored document so the client can update IndexedDB.
 */

import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import pako from "pako";
import type { ScheduleDoc } from "@rehearsal-block/core";
import { r2 } from "$lib/storage/r2-server.js";
import { getShowMeta, updateShowMeta, logShowActivity } from "$lib/storage/supabase.js";
import { supabaseAdmin } from "$lib/supabase/admin.js";

export const POST: RequestHandler = async ({ params, request, locals, url }) => {
  const isLocalhost = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  const user = locals.user;

  if (!isLocalhost && !user) {
    throw error(401, "Not authenticated");
  }

  const showId = params.id;
  const body = await request.json();
  const date = body.date as string;

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw error(400, "Invalid or missing date (expected YYYY-MM-DD)");
  }

  // Verify ownership in production
  if (!isLocalhost && user) {
    const meta = await getShowMeta(supabaseAdmin, showId);
    if (!meta || meta.owner_id !== user.id) {
      throw error(404, "Show not found");
    }
  }

  const userId = user?.id ?? "dev-preview";
  const showKey = `show:${userId}:${showId}`;
  const snapshotKey = `snapshots/${userId}/${showId}/${date}.json.gz`;

  // Fetch the snapshot
  const gzipped = await r2.get(snapshotKey);
  if (!gzipped) {
    throw error(404, `No snapshot for ${date}`);
  }

  // Save current version as today's snapshot first (so restore is reversible)
  const today = new Date().toISOString().slice(0, 10);
  if (today !== date) {
    const todaySnapshotKey = `snapshots/${userId}/${showId}/${today}.json.gz`;
    try {
      await r2.copy(showKey, todaySnapshotKey);
    } catch {
      // Non-fatal: the show might not exist yet (edge case)
    }
  }

  // Restore the snapshot to the main key
  await r2.put(showKey, gzipped, "application/gzip");

  // Decompress to update metadata and return to client
  const docJson = pako.ungzip(gzipped, { to: "string" });
  const document: ScheduleDoc = JSON.parse(docJson);

  // Compute hash of the restored blob
  const hashBuffer = await crypto.subtle.digest("SHA-256", new Uint8Array(gzipped));
  const hash = Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  // Update metadata in production
  if (!isLocalhost && user) {
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

    await logShowActivity(supabaseAdmin, {
      show_id: showId,
      user_id: user.id,
      action: "restored_from_snapshot",
    });
  }

  return json({
    ok: true,
    document,
    name: document.show.name,
    updatedAt: new Date().toISOString(),
  });
};
