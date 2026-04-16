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

/* Short-lived cookie that tells /auth/callback where to send the user
   after a successful sign-in / magic-link exchange. We use a cookie
   rather than the `?next=` query param because Supabase's allowed
   redirect URL list sometimes strips query strings (or rejects URLs
   that don't exactly match), causing users to land on the Site URL
   (e.g. /) after OAuth and never reach /beta. The cookie survives
   that normalization. Ten-minute TTL is plenty for an auth round-trip. */
const AUTH_NEXT_COOKIE = "rb_auth_next";
const AUTH_NEXT_MAX_AGE = 60 * 10;

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
  google: async ({ locals, url, cookies }) => {
    cookies.set(AUTH_NEXT_COOKIE, "/beta", {
      path: "/",
      maxAge: AUTH_NEXT_MAX_AGE,
      httpOnly: true,
      sameSite: "lax",
      secure: url.protocol === "https:",
    });
    const { data, error } = await locals.supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        /* ?next=/beta is kept as a belt-and-suspenders fallback; the
           cookie is the primary signal /auth/callback reads. */
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

  magiclink: async ({ request, locals, url, cookies }) => {
    const formData = await request.formData();
    const email = formData.get("email");

    if (typeof email !== "string" || !email.includes("@")) {
      return fail(400, { email, error: "Please enter a valid email address." });
    }

    cookies.set(AUTH_NEXT_COOKIE, "/beta", {
      path: "/",
      maxAge: AUTH_NEXT_MAX_AGE,
      httpOnly: true,
      sameSite: "lax",
      secure: url.protocol === "https:",
    });
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
