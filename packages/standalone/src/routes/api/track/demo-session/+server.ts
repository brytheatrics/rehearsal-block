/**
 * POST /api/track/demo-session - Record a demo session summary.
 *
 * Called once per demo visit (via sendBeacon on unload). Tracks
 * session duration and interaction count so Blake can understand
 * how long people spend exploring the demo.
 *
 * Supports navigator.sendBeacon which sends the body as a Blob.
 */

import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { supabaseAdmin } from "$lib/supabase/admin.js";

export const POST: RequestHandler = async ({ request, getClientAddress }) => {
  let body;
  try {
    body = await request.json();
  } catch {
    // sendBeacon may send as text/plain
    const text = await request.text();
    try {
      body = JSON.parse(text);
    } catch {
      return json({ ok: false }, { status: 400 });
    }
  }

  let ip: string;
  try {
    ip = getClientAddress();
  } catch {
    ip = "unknown";
  }
  const ua = request.headers.get("user-agent") ?? "";

  // Daily-rotating hash for deduplication
  const salt = new Date().toISOString().slice(0, 10);
  const data = new TextEncoder().encode(`${ip}:${ua}:${salt}`);
  const hashBuf = await crypto.subtle.digest("SHA-256", data);
  const visitor_hash = Array.from(new Uint8Array(hashBuf))
    .slice(0, 8)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  try {
    await supabaseAdmin.from("demo_sessions").insert({
      visitor_hash,
      duration_seconds: Math.min(body.durationSeconds ?? 0, 7200), // cap at 2h
      interaction_count: Math.min(body.interactionCount ?? 0, 10000),
      created_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Failed to insert demo session:", err);
  }

  return json({ ok: true });
};
