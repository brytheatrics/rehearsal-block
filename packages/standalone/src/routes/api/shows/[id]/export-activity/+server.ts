/**
 * POST /api/shows/[id]/export-activity - Log an export action.
 *
 * Records "exported_json" in show_activity for refund eligibility tracking.
 */

import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { getShowMeta, logShowActivity } from "$lib/storage/supabase.js";
import { supabaseAdmin } from "$lib/supabase/admin.js";

export const POST: RequestHandler = async ({ params, request, locals }) => {
  const user = locals.user;
  if (!user) throw error(401, "Not authenticated");

  const showId = params.id;

  const meta = await getShowMeta(supabaseAdmin, showId);
  if (!meta || meta.owner_id !== user.id) {
    throw error(404, "Show not found");
  }

  const body = await request.json();
  const action = body.action ?? "exported_json";

  await logShowActivity(supabaseAdmin, {
    show_id: showId,
    user_id: user.id,
    action,
  });

  return json({ ok: true });
};
