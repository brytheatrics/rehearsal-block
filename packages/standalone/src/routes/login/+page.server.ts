import { fail, redirect } from "@sveltejs/kit";
import type { Actions } from "./$types";
import { PUBLIC_SITE_URL } from "$env/static/public";

export const actions: Actions = {
  google: async ({ locals, url }) => {
    // TODO (pre-launch): replace this full-page OAuth redirect with Google
    // Identity Services / One Tap + supabase.auth.signInWithIdToken.
    //
    // Reason: the current redirect flow sends users to
    // phnttqdakknrejzbnfwh.supabase.co which looks sketchy on Google's
    // consent screen - users see a random Supabase project URL instead of
    // the Rehearsal Block domain. Switching to ID token flow shows the
    // user "Sign in to rehearsalblock.com" (our domain) and can use a
    // popup/One Tap instead of a full-page redirect. Much better UX.
    //
    // Implementation sketch:
    //   1. Add Google Identity Services script to app.html or a layout
    //   2. Render google.accounts.id.renderButton on the login page
    //   3. In the callback, call supabase.auth.signInWithIdToken({
    //        provider: 'google', token: credential
    //      })
    //   4. Update Google Cloud OAuth client → add Authorized JavaScript
    //      Origins for rehearsalblock.com / localhost:5173
    //
    // See: https://supabase.com/docs/guides/auth/social-login/auth-google
    //      (the "Personalized Sign-In Buttons" section)
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
