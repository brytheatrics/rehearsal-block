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
    if (!locals.hasAppAccess) {
      if (locals.profile?.has_beta_access && !locals.betaActive) {
        redirect(303, "/buy?beta_ended=1");
      }
      redirect(303, "/buy");
    }
  }

  /* Read the display expiration date for the beta banner. Signed-in beta
     users see "Beta ends <date>" in the top banner. The view excludes the
     beta_code so this is safe to read from the authenticated client. */
  let betaDisplayExpiration: string | null = null;
  if (!isLocalhost && locals.profile?.has_beta_access && locals.betaActive) {
    try {
      const { data } = await locals.supabase
        .from("beta_status")
        .select("display_expiration_date")
        .maybeSingle();
      betaDisplayExpiration = data?.display_expiration_date ?? null;
    } catch {
      betaDisplayExpiration = null;
    }
  }

  return {
    user: locals.user ?? { id: "dev-preview", email: "dev@localhost" },
    profile:
      locals.profile ??
      ({
        id: "dev-preview",
        email: "dev@localhost",
        has_paid: true,
        has_beta_access: false,
        stripe_customer_id: null,
        created_at: new Date().toISOString(),
      } as UserProfile),
    betaActive: locals.betaActive ?? false,
    betaDisplayExpiration,
  };
};
