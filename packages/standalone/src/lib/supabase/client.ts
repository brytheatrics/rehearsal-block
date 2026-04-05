/**
 * Browser-side Supabase client. Used by +layout.ts and any client-only code.
 *
 * This client only has access to the publishable key (safe to expose) and
 * operates as the logged-in user, subject to RLS policies.
 */

import { createBrowserClient, isBrowser } from "@supabase/ssr";
import { PUBLIC_SUPABASE_PUBLISHABLE_KEY, PUBLIC_SUPABASE_URL } from "$env/static/public";

export function createSupabaseBrowserClient() {
  return createBrowserClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll: () => {
        if (!isBrowser()) return [];
        return document.cookie
          .split("; ")
          .filter(Boolean)
          .map((c) => {
            const [name, ...rest] = c.split("=");
            return { name: name ?? "", value: rest.join("=") };
          });
      },
    },
  });
}
