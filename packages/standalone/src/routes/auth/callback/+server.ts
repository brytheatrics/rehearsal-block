/**
 * OAuth + magic link callback handler.
 *
 * When Supabase finishes the Google sign-in flow (or the user clicks
 * their magic link), the browser lands here with a `code` query param.
 * We exchange it for a session cookie, then redirect to /app (if paid)
 * or /buy (if still needs to purchase).
 */

import { redirect } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ url, locals }) => {
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/app";

  if (code) {
    const { error } = await locals.supabase.auth.exchangeCodeForSession(code);
    if (error) {
      redirect(303, "/login?error=callback_failed");
    }
  }

  // After sign-in, the hooks.server.ts authGuard will handle redirecting
  // to /buy if the user hasn't paid yet. Just send them to the intended
  // destination and let the guard do its thing.
  redirect(303, next);
};
