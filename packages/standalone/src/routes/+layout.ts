import { createBrowserClient, createServerClient, isBrowser } from "@supabase/ssr";
import { PUBLIC_SUPABASE_PUBLISHABLE_KEY, PUBLIC_SUPABASE_URL } from "$env/static/public";
import type { LayoutLoad } from "./$types";

export const load: LayoutLoad = async ({ data, depends, fetch }) => {
  depends("supabase:auth");

  const supabase = isBrowser()
    ? createBrowserClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
        global: { fetch },
      })
    : createServerClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
        global: { fetch },
        cookies: {
          getAll: () => [],
        },
      });

  return {
    supabase,
    session: data.session,
    user: data.user,
    profile: data.profile,
  };
};
