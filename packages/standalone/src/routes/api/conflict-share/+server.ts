/**
 * POST /api/conflict-share - Snapshot the show for conflict collection.
 *
 * Writes the show doc to R2 at conflict-show:<token> so actors can
 * view the schedule and submit their conflicts. Generates a token on
 * first use and persists it in shows_index.conflict_share_token.
 */

import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import type { ScheduleDoc } from "@rehearsal-block/core";
import pako from "pako";
import { r2 } from "$lib/storage/r2-server.js";
import { supabaseAdmin } from "$lib/supabase/admin.js";

function generateToken(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let token = "";
  for (let i = 0; i < 8; i++) {
    token += chars[Math.floor(Math.random() * chars.length)];
  }
  return token;
}

export const POST: RequestHandler = async ({ request, locals }) => {
  const user = locals.user;
  const isLocalhost =
    request.headers.get("host")?.includes("localhost") ||
    request.headers.get("host")?.includes("127.0.0.1");
  if (!user && !isLocalhost) throw error(401, "Not authenticated");

  const body = await request.json();
  const { doc, showId, existingToken } = body as {
    doc: ScheduleDoc;
    showId?: string;
    existingToken?: string | null;
  };

  if (!doc || !doc.show || !doc.cast) {
    return error(400, "Invalid schedule data");
  }

  // Use existing token or generate a new one
  let token = existingToken ?? generateToken();

  // Persist token in shows_index if we have a showId
  if (showId && user) {
    const { data: existing } = await supabaseAdmin
      .from("shows_index")
      .select("conflict_share_token")
      .eq("id", showId)
      .eq("owner_id", user.id)
      .maybeSingle();

    if (existing?.conflict_share_token) {
      token = existing.conflict_share_token;
    } else {
      await supabaseAdmin
        .from("shows_index")
        .update({ conflict_share_token: token })
        .eq("id", showId);
    }
  }

  // Gzip and write to R2
  const docJson = JSON.stringify(doc);
  const gzipped = pako.gzip(docJson);
  await r2.put(`conflict-show:${token}`, new Uint8Array(gzipped), "application/gzip");

  return json({ token });
};

/** GET: retrieve a conflict show snapshot by token. */
export const GET: RequestHandler = async ({ url }) => {
  const token = url.searchParams.get("token");
  if (!token) return error(400, "Missing token parameter");

  const gzipped = await r2.get(`conflict-show:${token}`);
  if (!gzipped) return error(404, "Conflict collection link not found or expired");

  const docJson = pako.ungzip(gzipped, { to: "string" });
  const doc = JSON.parse(docJson) as ScheduleDoc;

  return json({ doc });
};
