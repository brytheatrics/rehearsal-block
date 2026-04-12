/**
 * POST /api/shows/[id]/archive - Toggle archive status.
 *
 * Archive: copies R2 blob from show:<userId>:<showId> to archive:<userId>:<showId>,
 * deletes the original, sets archived_at in shows_index.
 *
 * Unarchive: copies back, clears archived_at.
 */

import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { r2 } from "$lib/storage/r2-server.js";
import { getShowMeta, updateShowMeta, logShowActivity } from "$lib/storage/supabase.js";
import { supabaseAdmin } from "$lib/supabase/admin.js";

export const POST: RequestHandler = async ({ params, locals }) => {
  const user = locals.user;
  if (!user) throw error(401, "Not authenticated");

  const showId = params.id;

  const meta = await getShowMeta(supabaseAdmin, showId);
  if (!meta || meta.owner_id !== user.id) {
    throw error(404, "Show not found");
  }

  const showKey = `show:${user.id}:${showId}`;
  const archiveKey = `archive:${user.id}:${showId}`;
  const isArchived = !!meta.archived_at;

  if (isArchived) {
    // Unarchive: copy from archive back to show, delete archive copy
    await r2.copy(archiveKey, showKey);
    await r2.delete(archiveKey);
    await updateShowMeta(supabaseAdmin, showId, { archived_at: null });
    await logShowActivity(supabaseAdmin, {
      show_id: showId,
      user_id: user.id,
      action: "unarchived",
    });
    return json({ archived: false });
  } else {
    // Archive: copy from show to archive, delete show copy
    await r2.copy(showKey, archiveKey);
    await r2.delete(showKey);
    await updateShowMeta(supabaseAdmin, showId, { archived_at: new Date().toISOString() });
    await logShowActivity(supabaseAdmin, {
      show_id: showId,
      user_id: user.id,
      action: "archived",
    });
    return json({ archived: true });
  }
};
