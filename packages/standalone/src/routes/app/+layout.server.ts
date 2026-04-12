import { redirect } from "@sveltejs/kit";
import type { LayoutServerLoad } from "./$types";

/**
 * Route guard for /app/* - enforces signed-in + paid.
 *
 * Note: hooks.server.ts also guards this route, so this is a belt-and-suspenders
 * layer. If hooks logic ever changes, this still protects /app.
 *
 * On localhost the guard is bypassed so the show list UI can be
 * previewed without a real Supabase session. Remove this bypass
 * before launch (or when Phase 1 storage wires real auth).
 */
export const load: LayoutServerLoad = async ({ locals, url }) => {
  const isLocalhost = url.hostname === "localhost" || url.hostname === "127.0.0.1";

  if (!isLocalhost) {
    if (!locals.user) {
      redirect(303, "/login");
    }
    if (!locals.profile?.has_paid) {
      redirect(303, "/buy");
    }
  }

  return {
    user: locals.user ?? { id: "dev-preview", email: "dev@localhost" },
    profile: locals.profile ?? { has_paid: true, created_at: new Date().toISOString() },
  };
};
