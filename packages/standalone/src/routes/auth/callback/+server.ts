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

const AUTH_NEXT_COOKIE = "rb_auth_next";

/** Only accept same-origin paths to prevent open-redirect abuse via the
 *  `next` query param or cookie. Must start with a single "/" and not
 *  begin with "//" (which browsers interpret as scheme-relative). */
function safeInternalPath(value: string | null | undefined): string | null {
  if (!value) return null;
  if (!value.startsWith("/")) return null;
  if (value.startsWith("//")) return null;
  return value;
}

export const GET: RequestHandler = async ({ url, locals, cookies }) => {
  const code = url.searchParams.get("code");

  /* Resolve post-auth destination. Priority:
     1. rb_auth_next cookie (set by /beta and any future route that
        initiates sign-in; survives Supabase URL normalization).
     2. ?next= query param (fallback; sometimes stripped by Supabase).
     3. /app (default destination for paid users). */
  const cookieNext = safeInternalPath(cookies.get(AUTH_NEXT_COOKIE));
  const queryNext = safeInternalPath(url.searchParams.get("next"));
  const next = cookieNext ?? queryNext ?? "/app";

  // Consume the cookie so a later sign-in doesn't accidentally route
  // somewhere stale.
  if (cookieNext) {
    cookies.delete(AUTH_NEXT_COOKIE, { path: "/" });
  }

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
