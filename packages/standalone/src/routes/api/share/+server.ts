/**
 * Share endpoint. Stores a ScheduleDoc as a gzipped blob in R2 keyed by
 * a stable 8-char ID so the share URL never changes across republishes.
 *
 * POST: create or update a shared schedule (writes to R2).
 * GET: retrieve a shared schedule by ID (reads from R2).
 *
 * When a public R2 bucket + custom domain is configured, the GET path
 * becomes unnecessary - the /view page fetches directly from CDN.
 */

import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import type { ScheduleDoc } from "@rehearsal-block/core";
import pako from "pako";
import { r2 } from "$lib/storage/r2-server.js";

function generateId(): string {
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

  // Reuse existing ID or generate a new one
  let id = existingId ?? generateId();

  // If existing ID provided, verify it exists in R2; if not, generate new
  if (existingId) {
    const exists = await r2.head(`share:${existingId}`);
    if (!exists) id = generateId();
    else id = existingId;
  }

  // Gzip and store in R2
  const docJson = JSON.stringify(doc);
  const gzipped = pako.gzip(docJson);
  await r2.put(`share:${id}`, new Uint8Array(gzipped), "application/gzip");

  return json({ id });
};

/** GET: retrieve a shared schedule by ID. */
export const GET: RequestHandler = async ({ url }) => {
  const id = url.searchParams.get("id");
  if (!id) return error(400, "Missing id parameter");

  const gzipped = await r2.get(`share:${id}`);
  if (!gzipped) return error(404, "Schedule not found or link expired");

  const docJson = pako.ungzip(gzipped, { to: "string" });
  const doc = JSON.parse(docJson) as ScheduleDoc;

  return json({ doc });
};
