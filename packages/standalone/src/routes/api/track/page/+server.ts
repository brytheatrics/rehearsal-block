/**
 * POST /api/track/page - Record a page view.
 *
 * Cookieless, privacy-friendly tracking for public routes only.
 * Computes a daily-rotating visitor_hash from IP + UA + daily salt
 * so repeat visits within a day are deduplicated without storing
 * any personally identifiable information.
 *
 * NOT used on /app/** routes - paid users get zero tracking.
 */

import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { supabaseAdmin } from "$lib/supabase/admin.js";

// In-memory buffer: accumulate rows and flush every 5 seconds or 10 rows
let buffer: Array<{
  visitor_hash: string;
  path: string;
  referrer: string;
  created_at: string;
}> = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

async function flush() {
  if (buffer.length === 0) return;
  const rows = buffer.splice(0);
  try {
    await supabaseAdmin.from("page_views").insert(rows);
  } catch (err) {
    console.error("Failed to flush page views:", err);
  }
}

function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flush();
  }, 5000);
}

async function hashVisitor(ip: string, ua: string): Promise<string> {
  // Daily salt so the hash rotates every day (no cross-day tracking)
  const salt = new Date().toISOString().slice(0, 10);
  const data = new TextEncoder().encode(`${ip}:${ua}:${salt}`);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .slice(0, 8)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export const POST: RequestHandler = async ({ request, getClientAddress }) => {
  const body = await request.json();
  const path = (body.path as string) ?? "/";

  // Don't track /app routes
  if (path.startsWith("/app")) {
    return json({ ok: true });
  }

  let ip: string;
  try {
    ip = getClientAddress();
  } catch {
    ip = "unknown";
  }
  const ua = request.headers.get("user-agent") ?? "";
  const referrer = ((body.referrer as string) ?? "").slice(0, 255);
  const visitor_hash = await hashVisitor(ip, ua);

  buffer.push({
    visitor_hash,
    path,
    referrer,
    created_at: new Date().toISOString(),
  });

  if (buffer.length >= 10) {
    flush();
  } else {
    scheduleFlush();
  }

  return json({ ok: true });
};
