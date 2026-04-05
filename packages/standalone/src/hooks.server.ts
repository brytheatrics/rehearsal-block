/**
 * SvelteKit server hook that attaches a Supabase client to every request
 * and loads the authenticated user (if any). Subsequent server code can
 * read `event.locals.supabase`, `event.locals.user`, etc.
 *
 * Based on the official Supabase + SvelteKit SSR guide.
 */

import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { type Handle, redirect } from "@sveltejs/kit";
import { sequence } from "@sveltejs/kit/hooks";
import { PUBLIC_SUPABASE_PUBLISHABLE_KEY, PUBLIC_SUPABASE_URL } from "$env/static/public";

const supabase: Handle = async ({ event, resolve }) => {
  event.locals.supabase = createServerClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll: () => event.cookies.getAll(),
      setAll: (cookiesToSet: Array<{ name: string; value: string; options: CookieOptions }>) => {
        cookiesToSet.forEach(({ name, value, options }) => {
          event.cookies.set(name, value, { ...options, path: "/" });
        });
      },
    },
  });

  /**
   * Supabase's `getSession` does not validate the JWT. `safeGetSession`
   * calls `getUser` first (which does validate) so any compromised session
   * is rejected before it reaches our code.
   */
  event.locals.safeGetSession = async () => {
    const {
      data: { session },
    } = await event.locals.supabase.auth.getSession();
    if (!session) {
      return { session: null, user: null };
    }

    const {
      data: { user },
      error,
    } = await event.locals.supabase.auth.getUser();
    if (error) {
      return { session: null, user: null };
    }

    return { session, user };
  };

  return resolve(event, {
    filterSerializedResponseHeaders(name) {
      return name === "content-range" || name === "x-supabase-api-version";
    },
  });
};

const authGuard: Handle = async ({ event, resolve }) => {
  const { session, user } = await event.locals.safeGetSession();
  event.locals.session = session;
  event.locals.user = user;

  // Load profile (has_paid flag) for signed-in users
  if (user) {
    const { data: profile } = await event.locals.supabase
      .from("profiles")
      .select("id, email, has_paid, stripe_customer_id, created_at")
      .eq("id", user.id)
      .single();
    event.locals.profile = profile ?? null;
  } else {
    event.locals.profile = null;
  }

  // Route guards: /app requires signed in + paid
  if (event.url.pathname.startsWith("/app")) {
    if (!user) {
      redirect(303, "/login");
    }
    if (!event.locals.profile?.has_paid) {
      redirect(303, "/buy");
    }
  }

  // Redirect already-signed-in paid users away from /login and /buy
  if (event.url.pathname === "/login" && user && event.locals.profile?.has_paid) {
    redirect(303, "/app");
  }

  return resolve(event);
};

export const handle: Handle = sequence(supabase, authGuard);
