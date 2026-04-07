/**
 * Share endpoint. Stores a ScheduleDoc keyed by a stable ID so the
 * share URL never changes. POST creates or updates, GET retrieves.
 *
 * Dev: in-memory Map (lost on server restart).
 * Production: swap for Supabase or Netlify Blobs.
 */

import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import type { ScheduleDoc } from "@rehearsal-block/core";

/** In-memory store. Replace with DB for production. */
const store = new Map<string, ScheduleDoc>();

function generateId(): string {
  // 8-char alphanumeric, URL-safe
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let id = "";
  for (let i = 0; i < 8; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

/** POST: create or update a shared schedule. */
export const POST: RequestHandler = async ({ request }) => {
  const body = await request.json();
  const doc = body.doc as ScheduleDoc;
  const existingId = body.id as string | undefined;

  if (!doc || !doc.show || !doc.cast || !doc.schedule) {
    return error(400, "Invalid schedule data");
  }

  const id = existingId && store.has(existingId) ? existingId : generateId();
  store.set(id, doc);

  return json({ id });
};

/** GET: retrieve a shared schedule by ID. */
export const GET: RequestHandler = async ({ url }) => {
  const id = url.searchParams.get("id");
  if (!id) return error(400, "Missing id parameter");

  const doc = store.get(id);
  if (!doc) return error(404, "Schedule not found or link expired");

  return json({ doc });
};
