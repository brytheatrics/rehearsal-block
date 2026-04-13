import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { getShowMeta } from "$lib/storage/supabase.js";
import { supabaseAdmin } from "$lib/supabase/admin.js";

/**
 * Load show metadata for /app/[showId]. Verifies ownership.
 *
 * The actual document is loaded client-side from IndexedDB (instant)
 * with an API fallback. This server load only provides metadata for
 * the page title and ownership verification.
 */
export const load: PageServerLoad = async ({ params, locals, url }) => {
  const isLocalhost = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  const showId = params.showId;

  if (isLocalhost) {
    // On localhost, skip ownership check - allow previewing without auth
    return {
      showId,
      showTitle: null, // will be populated client-side
    };
  }

  if (!locals.user) {
    error(401, "Not authenticated");
  }

  const meta = await getShowMeta(supabaseAdmin, showId);
  if (!meta || meta.owner_id !== locals.user.id) {
    error(404, "Show not found");
  }

  return {
    showId: meta.id,
    showTitle: meta.name,
  };
};
