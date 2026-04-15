/**
 * SvelteKit server hook that attaches a Supabase client to every request
 * and loads the authenticated user (if any). Subsequent server code can
 * read `event.locals.supabase`, `event.locals.user`, etc.
 *
 * Based on the official Supabase + SvelteKit SSR guide.
 */

import * as Sentry from "@sentry/sveltekit";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { type Handle, redirect } from "@sveltejs/kit";
import { PUBLIC_SENTRY_DSN } from "$env/static/public";

// Skip Sentry in local dev so iterations don't pollute production's
// issue list. NODE_ENV is "production" in Netlify Functions runtime
// and "development" in `vite dev`. process.env.NETLIFY is set at
// build time but not always at runtime, so don't rely on it here.
const isProdServer = process.env.NODE_ENV === "production";

if (PUBLIC_SENTRY_DSN && isProdServer) {
  Sentry.init({
    dsn: PUBLIC_SENTRY_DSN,
    tracesSampleRate: 0,
  });
}
import { sequence } from "@sveltejs/kit/hooks";
import { PUBLIC_SUPABASE_PUBLISHABLE_KEY, PUBLIC_SUPABASE_URL } from "$env/static/public";

const supabase: Handle = async ({ event, resolve }) => {
  try {
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
  } catch {
    // Supabase unavailable - set a stub so downstream code doesn't crash
    event.locals.supabase = null as any;
  }

  event.locals.safeGetSession = async () => {
    try {
      if (!event.locals.supabase) return { session: null, user: null };
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
    } catch {
      return { session: null, user: null };
    }
  };

  return resolve(event, {
    filterSerializedResponseHeaders(name) {
      return name === "content-range" || name === "x-supabase-api-version";
    },
  });
};

const authGuard: Handle = async ({ event, resolve }) => {
  let session = null;
  let user = null;

  try {
    const result = await event.locals.safeGetSession();
    session = result.session;
    user = result.user;
  } catch {
    // Supabase unavailable - continue without auth
  }

  event.locals.session = session;
  event.locals.user = user;

  // Load profile (has_paid flag + has_beta_access) for signed-in users
  if (user) {
    try {
      const { data: profile } = await event.locals.supabase
        .from("profiles")
        .select("id, email, has_paid, has_beta_access, stripe_customer_id, created_at")
        .eq("id", user.id)
        .single();
      event.locals.profile = profile ?? null;
    } catch {
      event.locals.profile = null;
    }
  } else {
    event.locals.profile = null;
  }

  // Beta gate. During the beta period, users with has_beta_access get the
  // same /app access as paid users - BUT only while beta_config.beta_active
  // is true. The active flag is read from the beta_status view (public),
  // so flipping it in the dashboard takes effect on the next request.
  //
  // Cached on event.locals so /app pages + BetaBanner don't re-query per
  // request. Cheap (single-row view) but still pointless to repeat.
  let betaActive = false;
  try {
    if (event.locals.supabase) {
      const { data: betaStatus } = await event.locals.supabase
        .from("beta_status")
        .select("is_active")
        .maybeSingle();
      betaActive = !!betaStatus?.is_active;
    }
  } catch {
    betaActive = false;
  }
  event.locals.betaActive = betaActive;
  event.locals.hasAppAccess =
    !!event.locals.profile?.has_paid ||
    (!!event.locals.profile?.has_beta_access && betaActive);

  // Route guards: /app requires signed in + (paid OR active beta).
  // Bypass on localhost so the show list UI can be previewed during
  // development without a real Supabase session. Remove this bypass
  // before launch (or when Phase 1 storage wires real auth).
  const isLocalhost = event.url.hostname === "localhost" || event.url.hostname === "127.0.0.1";
  if (event.url.pathname.startsWith("/app") && !isLocalhost) {
    if (!user) {
      redirect(303, "/login");
    }
    if (!event.locals.hasAppAccess) {
      // Beta access expired (beta_active flipped off) - send them to
      // /buy with a hint. Users who never had beta access also land
      // here naturally.
      if (event.locals.profile?.has_beta_access && !betaActive) {
        redirect(303, "/buy?beta_ended=1");
      }
      redirect(303, "/buy");
    }
  }

  // Redirect already-signed-in paid OR active-beta users away from /login
  if (event.url.pathname === "/login" && user && event.locals.hasAppAccess) {
    redirect(303, "/app");
  }

  return resolve(event);
};

export const handle: Handle = sequence(Sentry.sentryHandle(), supabase, authGuard);
export const handleError = Sentry.handleErrorWithSentry();
