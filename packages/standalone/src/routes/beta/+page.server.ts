/**
 * /beta landing page.
 *
 * Three branches depending on the visitor's state:
 *   - Not signed in: show the sign-in options (same actions as /login).
 *   - Signed in but no beta access: show the code entry form.
 *   - Signed in with active beta access: redirect straight to /app.
 *
 * Gates:
 *   - If beta_active is false, show a "beta ended" message regardless of
 *     whether the user previously activated.
 */

import { fail, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals }) => {
  let betaActive = false;
  let displayExpiration: string | null = null;

  try {
    if (locals.supabase) {
      const { data } = await locals.supabase
        .from("beta_status")
        .select("is_active, display_expiration_date")
        .maybeSingle();
      betaActive = !!data?.is_active;
      displayExpiration = data?.display_expiration_date ?? null;
    }
  } catch {
    /* fall through with defaults */
  }

  // Already activated + beta still running: go straight to /app.
  if (
    locals.user &&
    locals.profile?.has_beta_access &&
    betaActive &&
    locals.hasAppAccess
  ) {
    redirect(303, "/app");
  }

  return {
    betaActive,
    displayExpiration,
    alreadyActivated: !!locals.profile?.has_beta_access,
  };
};

export const actions: Actions = {
  /* Mirror /login's google action so testers can sign in from /beta
     without bouncing to /login. Same implementation. */
  google: async ({ locals, url }) => {
    const { data, error } = await locals.supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${url.origin}/auth/callback?next=/beta`,
      },
    });
    if (error) {
      return fail(500, { error: "Could not start Google sign-in. Try again." });
    }
    if (data.url) {
      redirect(303, data.url);
    }
    return fail(500, { error: "No redirect URL returned from Supabase." });
  },

  magiclink: async ({ request, locals, url }) => {
    const formData = await request.formData();
    const email = formData.get("email");

    if (typeof email !== "string" || !email.includes("@")) {
      return fail(400, { email, error: "Please enter a valid email address." });
    }

    const { error } = await locals.supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${url.origin}/auth/callback?next=/beta`,
      },
    });

    if (error) {
      return fail(500, { email, error: "Could not send the magic link. Try again." });
    }

    return { success: true, email };
  },
};
