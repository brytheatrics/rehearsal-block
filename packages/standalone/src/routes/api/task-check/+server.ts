/**
 * /api/task-check - the carpenter share view's check-state endpoint.
 *
 * The doc itself (tasks, days, backlog) lives gzipped in R2 keyed by
 * the share id - immutable from the share view's perspective. This
 * endpoint is the writable overlay where carpenters' check toggles
 * actually persist, separate from the doc so:
 *
 *   1. Concurrent toggles from multiple carpenters don't fight each
 *      other for the doc blob - each task is its own row.
 *   2. The editor's save loop never collides with carpenter writes.
 *   3. Writes are tiny (one row update, ~80 bytes) instead of a
 *      full doc round-trip.
 *
 * Auth model: possessing the share id is the credential. Anyone with
 * the link can read and write any task's check state. The only
 * gating is an R2 `head` call on POST so random share ids can't be
 * used to spam the table with orphan rows.
 *
 * Endpoints:
 *   POST { shareId, taskId, done, doneBy? }  -> upsert
 *   GET  ?shareId=xxx                        -> [{ task_id, done, done_by, done_at }, ...]
 */

import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { r2 } from "$lib/storage/r2-server.js";
import { supabaseAdmin } from "$lib/supabase/admin.js";

export const POST: RequestHandler = async ({ request }) => {
  const body = await request.json().catch(() => null);
  const shareId = typeof body?.shareId === "string" ? body.shareId.trim() : "";
  const taskId = typeof body?.taskId === "string" ? body.taskId.trim() : "";
  const done = !!body?.done;
  const doneByRaw = typeof body?.doneBy === "string" ? body.doneBy.trim() : "";
  /* Cap doneBy at 80 chars so a malicious carpenter can't stash a
     novel into the field. Names like "Frank Smith (volunteer)"
     comfortably fit. */
  const doneBy = doneByRaw.length > 0 ? doneByRaw.slice(0, 80) : null;

  if (!shareId || !taskId) {
    return error(400, "Missing shareId or taskId");
  }

  /* Verify the share blob actually exists in R2 before letting a
     write through. This is the only barrier between random callers
     and the table - cheap (one HEAD per write) and prevents drive-by
     spam against guessed share ids. */
  const exists = await r2.head(`share:${shareId}`);
  if (!exists) {
    return error(404, "Share not found");
  }

  const row = {
    share_id: shareId,
    task_id: taskId,
    done,
    done_by: done ? doneBy : null,
    done_at: done ? new Date().toISOString() : null,
  };

  const { error: dbErr } = await supabaseAdmin
    .from("task_checks")
    .upsert(row, { onConflict: "share_id,task_id" });
  if (dbErr) {
    return error(500, `Could not save check: ${dbErr.message}`);
  }

  return json({ ok: true });
};

export const GET: RequestHandler = async ({ url }) => {
  const shareId = url.searchParams.get("shareId");
  if (!shareId) return error(400, "Missing shareId");

  const { data, error: dbErr } = await supabaseAdmin
    .from("task_checks")
    .select("task_id, done, done_by, done_at")
    .eq("share_id", shareId);
  if (dbErr) {
    return error(500, `Could not fetch checks: ${dbErr.message}`);
  }

  return json({ checks: data ?? [] });
};
