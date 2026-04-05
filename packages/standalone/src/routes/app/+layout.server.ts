import { redirect } from "@sveltejs/kit";
import type { LayoutServerLoad } from "./$types";

/**
 * Route guard for /app/* — enforces signed-in + paid.
 *
 * Note: hooks.server.ts also guards this route, so this is a belt-and-suspenders
 * layer. If hooks logic ever changes, this still protects /app.
 */
export const load: LayoutServerLoad = async ({ locals }) => {
  if (!locals.user) {
    redirect(303, "/login");
  }
  if (!locals.profile?.has_paid) {
    redirect(303, "/buy");
  }
  return {
    user: locals.user,
    profile: locals.profile,
  };
};
