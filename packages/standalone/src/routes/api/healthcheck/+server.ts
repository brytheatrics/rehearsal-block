/**
 * Healthcheck endpoint for UptimeRobot + GitHub Actions keepalive.
 *
 * GET /api/healthcheck
 *
 * Pings Supabase (trivial query) and R2 (HEAD against the dev bucket)
 * to confirm both services are responsive. Returns 200 if both are up,
 * 500 with details if either is down.
 *
 * This endpoint serves double duty:
 * 1. UptimeRobot monitors it every 5 minutes and emails Blake if it
 *    returns non-200. Primary defense against Supabase Free's 7-day
 *    auto-pause.
 * 2. GitHub Actions cron hits it every 3 days as a second independent
 *    keepalive layer.
 */

import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { createClient } from "@supabase/supabase-js";
import { PUBLIC_SUPABASE_URL } from "$env/static/public";
import { env } from "$env/dynamic/private";

export const GET: RequestHandler = async () => {
  const results: Record<string, string> = {};
  let allOk = true;

  // --- Supabase ping ---
  try {
    const supabase = createClient(
      PUBLIC_SUPABASE_URL,
      env.SUPABASE_SECRET_KEY ?? "",
    );
    const { error } = await supabase.from("profiles").select("id").limit(1);
    if (error) {
      results.supabase = `error: ${error.message}`;
      allOk = false;
    } else {
      results.supabase = "responsive";
    }
  } catch (err) {
    results.supabase = `error: ${err instanceof Error ? err.message : "unknown"}`;
    allOk = false;
  }

  // --- R2 ping (HEAD request to the bucket endpoint) ---
  try {
    const accountId = env.R2_ACCOUNT_ID ?? "";
    const accessKeyId = env.R2_ACCESS_KEY_ID ?? "";
    const secretAccessKey = env.R2_SECRET_ACCESS_KEY ?? "";
    const bucket = env.R2_BUCKET_NAME ?? "";

    if (!accountId || !accessKeyId || !bucket) {
      results.r2 = "skipped (missing credentials)";
    } else {
      // Simple fetch against the R2 S3-compatible endpoint to verify
      // connectivity. We don't need the full AWS SDK here - a basic
      // unsigned GET to the bucket root returns 403 (access denied)
      // which still proves the endpoint is reachable. A timeout or
      // network error means R2 is down.
      const endpoint = `https://${accountId}.r2.cloudflarestorage.com`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      try {
        const res = await fetch(`${endpoint}/${bucket}`, {
          method: "HEAD",
          signal: controller.signal,
        });
        clearTimeout(timeout);
        // 403 = reachable but unsigned (expected). 200 = also fine.
        // Anything else is unexpected but still means R2 is responding.
        results.r2 = "responsive";
      } catch (fetchErr) {
        clearTimeout(timeout);
        results.r2 = `error: ${fetchErr instanceof Error ? fetchErr.message : "unreachable"}`;
        allOk = false;
      }
    }
  } catch (err) {
    results.r2 = `error: ${err instanceof Error ? err.message : "unknown"}`;
    allOk = false;
  }

  return json(
    { ok: allOk, ...results },
    { status: allOk ? 200 : 500 },
  );
};
