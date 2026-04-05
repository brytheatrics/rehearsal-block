/**
 * Admin (service-role) Supabase client. Bypasses RLS and has full database
 * access. Use ONLY in server-side code for operations that legitimately need
 * to cross user boundaries — e.g. the Stripe webhook marking a user as paid
 * based on the email in the webhook payload (no user session at that moment).
 *
 * Never expose this client to the browser. The env var it uses is not
 * prefixed with PUBLIC_ on purpose.
 */

import { createClient } from "@supabase/supabase-js";
import { SUPABASE_SECRET_KEY } from "$env/static/private";
import { PUBLIC_SUPABASE_URL } from "$env/static/public";

export const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});
