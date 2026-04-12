/**
 * POST /api/shows - Create a new show.
 *
 * Client generates a UUID and sends it along with the initial ScheduleDoc.
 * Server validates, writes the R2 blob, inserts the shows_index row,
 * and logs a "created" activity entry.
 */

import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import pako from "pako";
import type { ScheduleDoc } from "@rehearsal-block/core";
import { r2 } from "$lib/storage/r2-server.js";
import { insertShowMeta, logShowActivity } from "$lib/storage/supabase.js";
import { supabaseAdmin } from "$lib/supabase/admin.js";

export const POST: RequestHandler = async ({ request, locals }) => {
  const user = locals.user;
  if (!user) throw error(401, "Not authenticated");

  const body = await request.json();
  const { id, document } = body as { id: string; document: ScheduleDoc };

  if (!id || !document) {
    throw error(400, "Missing id or document");
  }

  // Gzip the document
  const docJson = JSON.stringify(document);
  const gzipped = pako.gzip(docJson);
  const gzippedBytes = new Uint8Array(gzipped);

  // Compute hash
  const hashBuffer = await crypto.subtle.digest("SHA-256", gzippedBytes);
  const hash = Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  // Write to R2
  const r2Key = `show:${user.id}:${id}`;
  await r2.put(r2Key, gzippedBytes);

  // Insert metadata row
  const meta = await insertShowMeta(supabaseAdmin, {
    id,
    owner_id: user.id,
    owner_email: user.email ?? null,
    name: document.show.name,
    start_date: document.show.startDate ?? null,
    end_date: document.show.endDate ?? null,
    cast_count: document.cast.length,
    document_hash: hash,
    document_size_bytes: gzippedBytes.length,
    doc_version: document.version,
  });

  // Log activity
  await logShowActivity(supabaseAdmin, {
    show_id: id,
    user_id: user.id,
    action: "created",
  });

  return json(meta, { status: 201 });
};
