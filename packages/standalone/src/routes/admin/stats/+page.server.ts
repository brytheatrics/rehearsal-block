/**
 * Admin stats page - gated to Blake's account.
 * Shows page view counts and demo session metrics.
 */

import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { supabaseAdmin } from "$lib/supabase/admin.js";

// Hardcoded admin email - only Blake can see stats
const ADMIN_EMAIL = "hello@rehearsalblock.com";

export const load: PageServerLoad = async ({ locals }) => {
  const isLocalhost =
    typeof process !== "undefined" && process.env.NODE_ENV === "development";

  if (!isLocalhost) {
    if (!locals.user || locals.user.email !== ADMIN_EMAIL) {
      error(404, "Not found");
    }
  }

  // Page views: last 30 days grouped by path and day
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60_000).toISOString();

  const { data: pageViews } = await supabaseAdmin
    .from("page_views")
    .select("path, created_at")
    .gte("created_at", thirtyDaysAgo)
    .order("created_at", { ascending: false })
    .limit(5000);

  // Demo sessions: last 30 days
  const { data: demoSessions } = await supabaseAdmin
    .from("demo_sessions")
    .select("duration_seconds, interaction_count, created_at")
    .gte("created_at", thirtyDaysAgo)
    .order("created_at", { ascending: false })
    .limit(1000);

  // Total shows and users
  const { count: totalShows } = await supabaseAdmin
    .from("shows_index")
    .select("*", { count: "exact", head: true });

  const { count: totalUsers } = await supabaseAdmin
    .from("profiles")
    .select("*", { count: "exact", head: true });

  const { count: paidUsers } = await supabaseAdmin
    .from("profiles")
    .select("*", { count: "exact", head: true })
    .eq("has_paid", true);

  // Aggregate page views by path
  const viewsByPath = new Map<string, number>();
  for (const pv of pageViews ?? []) {
    viewsByPath.set(pv.path, (viewsByPath.get(pv.path) ?? 0) + 1);
  }

  // Demo session stats
  const sessions = demoSessions ?? [];
  const avgDuration = sessions.length
    ? Math.round(sessions.reduce((s, d) => s + d.duration_seconds, 0) / sessions.length)
    : 0;
  const avgInteractions = sessions.length
    ? Math.round(sessions.reduce((s, d) => s + d.interaction_count, 0) / sessions.length)
    : 0;

  return {
    viewsByPath: Object.fromEntries(viewsByPath),
    totalPageViews: pageViews?.length ?? 0,
    demoSessionCount: sessions.length,
    avgDemoSeconds: avgDuration,
    avgDemoInteractions: avgInteractions,
    totalShows: totalShows ?? 0,
    totalUsers: totalUsers ?? 0,
    paidUsers: paidUsers ?? 0,
  };
};
