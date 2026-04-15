// See https://svelte.dev/docs/kit/types#app.d.ts

import type { Session, SupabaseClient, User } from "@supabase/supabase-js";

declare global {
  namespace App {
    interface Locals {
      supabase: SupabaseClient;
      safeGetSession: () => Promise<{ session: Session | null; user: User | null }>;
      session: Session | null;
      user: User | null;
      profile: UserProfile | null;
      betaActive: boolean;
      hasAppAccess: boolean;
    }
    interface PageData {
      session: Session | null;
      user: User | null;
      profile: UserProfile | null;
    }
    // interface Error {}
    // interface Platform {}
  }

  interface UserProfile {
    id: string;
    email: string | null;
    has_paid: boolean;
    has_beta_access: boolean;
    stripe_customer_id: string | null;
    created_at: string;
  }
}

export {};
