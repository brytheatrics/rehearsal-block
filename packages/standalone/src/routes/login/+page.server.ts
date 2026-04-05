import { fail, redirect } from "@sveltejs/kit";
import type { Actions } from "./$types";
import { PUBLIC_SITE_URL } from "$env/static/public";

export const actions: Actions = {
  google: async ({ locals, url }) => {
    const { data, error } = await locals.supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${url.origin}/auth/callback`,
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
        emailRedirectTo: `${url.origin}/auth/callback`,
      },
    });

    if (error) {
      return fail(500, { email, error: "Could not send the magic link. Try again." });
    }

    return { success: true, email };
  },

  signout: async ({ locals }) => {
    await locals.supabase.auth.signOut();
    redirect(303, "/");
  },
};
