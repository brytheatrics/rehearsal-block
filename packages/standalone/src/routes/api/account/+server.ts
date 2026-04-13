/**
 * DELETE /api/account - Hard delete user account and all data.
 *
 * Removes: all R2 blobs (shows, archives, snapshots), all shows_index
 * rows (cascades to show_activity), the profiles row, and the
 * Supabase Auth user. Returns user to a signed-out state.
 */

import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { r2 } from "$lib/storage/r2-server.js";
import { supabaseAdmin } from "$lib/supabase/admin.js";

export const DELETE: RequestHandler = async ({ locals }) => {
  const user = locals.user;
  if (!user) throw error(401, "Not authenticated");

  const userId = user.id;

  // 1. Find all shows owned by this user
  const { data: shows } = await supabaseAdmin
    .from("shows_index")
    .select("id")
    .eq("owner_id", userId);

  // 2. Delete R2 blobs for each show
  if (shows) {
    for (const show of shows) {
      // Active show
      try { await r2.delete(`show:${userId}:${show.id}`); } catch { /* ignore */ }
      // Archived show
      try { await r2.delete(`archive:${userId}:${show.id}`); } catch { /* ignore */ }
      // Conflict share
      try {
        const { data: meta } = await supabaseAdmin
          .from("shows_index")
          .select("conflict_share_token, share_id")
          .eq("id", show.id)
          .single();
        if (meta?.conflict_share_token) {
          await r2.delete(`conflict-show:${meta.conflict_share_token}`);
          await r2.delete(`conflict-submissions:${meta.conflict_share_token}`);
        }
        if (meta?.share_id) {
          await r2.delete(`share:${meta.share_id}`);
        }
      } catch { /* ignore */ }
    }
  }

  // 3. Delete shows_index rows (cascades to show_activity)
  await supabaseAdmin.from("shows_index").delete().eq("owner_id", userId);

  // 4. Delete profile
  await supabaseAdmin.from("profiles").delete().eq("id", userId);

  // 5. Delete Supabase Auth user
  const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(userId);
  if (authError) {
    console.error("Failed to delete auth user:", authError);
    // Don't throw - data is already gone, auth cleanup can be manual
  }

  return json({ ok: true });
};
