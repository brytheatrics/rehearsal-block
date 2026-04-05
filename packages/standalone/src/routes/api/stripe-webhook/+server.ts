/**
 * Stripe webhook endpoint.
 *
 * Stripe POSTs here after a checkout session completes. We verify the
 * signature (to make sure the request actually came from Stripe and not
 * someone spoofing it), then mark the matching user's profile as paid.
 *
 * Flow:
 * 1. Verify signature using STRIPE_WEBHOOK_SECRET
 * 2. Parse the event
 * 3. If it's checkout.session.completed, find the user via metadata/email
 * 4. Update profiles.has_paid = true
 *
 * Security notes:
 * - Uses the admin (service-role) Supabase client because at webhook time
 *   there's no user session — we're acting on behalf of the system.
 * - Never trusts the request body without signature verification.
 * - Idempotent: running twice on the same event is harmless.
 */

import { error, json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import type Stripe from "stripe";
import { stripe } from "$lib/stripe";
import { supabaseAdmin } from "$lib/supabase/admin";
import { STRIPE_WEBHOOK_SECRET } from "$env/static/private";

export const POST: RequestHandler = async ({ request }) => {
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    error(400, "Missing stripe-signature header");
  }

  const rawBody = await request.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error("Stripe webhook signature verification failed:", err);
    error(400, "Invalid signature");
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;

        if (session.payment_status !== "paid") {
          // Not paid yet — ignore
          return json({ received: true, ignored: "not paid" });
        }

        // Find user ID via metadata (set when we created the session),
        // then fall back to client_reference_id, then email lookup.
        let userId: string | undefined;
        if (session.metadata?.supabase_user_id) {
          userId = session.metadata.supabase_user_id;
        } else if (session.client_reference_id) {
          userId = session.client_reference_id;
        } else if (session.customer_email) {
          const { data: users } = await supabaseAdmin.auth.admin.listUsers();
          userId = users?.users.find((u) => u.email === session.customer_email)?.id;
        }

        if (!userId) {
          console.error("Webhook: no user could be matched for session", session.id);
          // Return 200 anyway — we don't want Stripe to retry this forever.
          // We'll need manual intervention to fix this user.
          return json({ received: true, error: "no matching user" });
        }

        const stripeCustomerId: string | null =
          typeof session.customer === "string" ? session.customer : null;

        const { error: updateError } = await supabaseAdmin
          .from("profiles")
          .update({
            has_paid: true,
            stripe_customer_id: stripeCustomerId,
          })
          .eq("id", userId);

        if (updateError) {
          console.error("Webhook: failed to update profile", updateError);
          error(500, "Database update failed");
        }

        console.log(`Webhook: marked user ${userId} as paid (session ${session.id})`);
        return json({ received: true, userId });
      }

      default:
        // Unhandled event types — return 200 so Stripe doesn't retry
        return json({ received: true, ignored: event.type });
    }
  } catch (err) {
    console.error("Webhook handler error:", err);
    error(500, "Webhook handler error");
  }
};
