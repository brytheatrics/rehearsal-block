/**
 * GET/POST/DELETE /api/conflict-submissions/[token]
 *
 * GET: List pending conflict submissions (director, authenticated).
 * POST: Submit conflicts (actor, public, rate-limited).
 * DELETE: Remove a submission by id (director, authenticated).
 */

import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import type { Conflict } from "@rehearsal-block/core";
import pako from "pako";
import { r2 } from "$lib/storage/r2-server.js";

// ---- Rate limiting ----
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 10;
const ipTimestamps = new Map<string, number[]>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const timestamps = ipTimestamps.get(ip) ?? [];
  const recent = timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);

  if (recent.length >= RATE_LIMIT_MAX) {
    ipTimestamps.set(ip, recent);
    return true;
  }

  recent.push(now);
  ipTimestamps.set(ip, recent);

  // Prune old IPs
  if (ipTimestamps.size > 5000) {
    for (const [k, v] of ipTimestamps) {
      if (v.every((t) => now - t > RATE_LIMIT_WINDOW_MS * 2)) {
        ipTimestamps.delete(k);
      }
    }
  }

  return false;
}

interface Submission {
  id: string;
  actorId: string;
  actorName: string;
  conflicts: Conflict[];
  submittedAt: string;
}

async function readSubmissions(token: string): Promise<Submission[]> {
  const gzipped = await r2.get(`conflict-submissions:${token}`);
  if (!gzipped) return [];
  try {
    const jsonStr = pako.ungzip(gzipped, { to: "string" });
    const parsed = JSON.parse(jsonStr);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeSubmissions(token: string, subs: Submission[]): Promise<void> {
  const jsonStr = JSON.stringify(subs);
  const gzipped = pako.gzip(jsonStr);
  await r2.put(`conflict-submissions:${token}`, new Uint8Array(gzipped), "application/gzip");
}

/** GET: list pending submissions (director). */
export const GET: RequestHandler = async ({ params, locals, url }) => {
  const isLocalhost =
    url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (!locals.user && !isLocalhost) throw error(401, "Not authenticated");

  const token = params.token;
  const subs = await readSubmissions(token);
  return json({ submissions: subs });
};

/** POST: submit conflicts (actor, public). */
export const POST: RequestHandler = async ({ params, request, getClientAddress }) => {
  const token = params.token;

  // Rate limit
  let ip: string;
  try {
    ip = getClientAddress();
  } catch {
    ip = "unknown";
  }
  if (isRateLimited(ip)) {
    throw error(429, "Too many submissions. Please wait a minute.");
  }

  // Payload size check
  const contentLength = request.headers.get("content-length");
  if (contentLength && parseInt(contentLength, 10) > 32_768) {
    throw error(413, "Submission too large");
  }

  // Verify conflict-show exists for this token
  const showExists = await r2.head(`conflict-show:${token}`);
  if (!showExists) {
    throw error(404, "Conflict collection link not found");
  }

  const body = await request.json();
  const { actorId, actorName, conflicts } = body as {
    actorId: string;
    actorName: string;
    conflicts: Conflict[];
  };

  if (!actorId || !actorName || !Array.isArray(conflicts)) {
    throw error(400, "Missing required fields");
  }

  const submission: Submission = {
    id: crypto.randomUUID(),
    actorId,
    actorName,
    conflicts,
    submittedAt: new Date().toISOString(),
  };

  // Append to existing submissions
  const existing = await readSubmissions(token);

  // Replace any existing submission from the same actor (re-submit)
  const filtered = existing.filter((s) => s.actorId !== actorId);
  filtered.push(submission);

  await writeSubmissions(token, filtered);

  return json({ ok: true, id: submission.id });
};

/** DELETE: remove a submission (director accepts or rejects). */
export const DELETE: RequestHandler = async ({ params, request, locals, url }) => {
  const isLocalhost =
    url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (!locals.user && !isLocalhost) throw error(401, "Not authenticated");

  const token = params.token;
  const body = await request.json();
  const submissionId = body.submissionId as string;

  if (!submissionId) throw error(400, "Missing submissionId");

  const existing = await readSubmissions(token);
  const filtered = existing.filter((s) => s.id !== submissionId);
  await writeSubmissions(token, filtered);

  return json({ ok: true });
};
