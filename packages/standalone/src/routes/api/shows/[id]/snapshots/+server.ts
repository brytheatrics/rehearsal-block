/**
 * GET /api/shows/[id]/snapshots
 *
 * Returns a list of available daily snapshots for a show.
 * Each snapshot is a date string (YYYY-MM-DD).
 */

import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { r2 } from "$lib/storage/r2-server.js";
import { getShowMeta } from "$lib/storage/supabase.js";
import { supabaseAdmin } from "$lib/supabase/admin.js";

export const GET: RequestHandler = async ({ params, locals, url }) => {
  const isLocalhost = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  const user = locals.user;

  if (!isLocalhost && !user) {
    throw error(401, "Not authenticated");
  }

  const showId = params.id;

  // Verify ownership in production
  if (!isLocalhost && user) {
    const meta = await getShowMeta(supabaseAdmin, showId);
    if (!meta || meta.owner_id !== user.id) {
      throw error(404, "Show not found");
    }
  }

  const userId = user?.id ?? "dev-preview";
  const prefix = `snapshots/${userId}/${showId}/`;

  let keys: string[] = [];
  try {
    keys = await r2.list(prefix);
  } catch {
    keys = [];
  }

  // Extract dates from keys: snapshots/<userId>/<showId>/<YYYY-MM-DD>.json.gz
  const dates = keys
    .map((key) => {
      const match = key.match(/(\d{4}-\d{2}-\d{2})\.json\.gz$/);
      return match?.[1] ?? null;
    })
    .filter((d): d is string => d !== null)
    .sort((a, b) => b.localeCompare(a)); // newest first

  return json({ snapshots: dates });
};
