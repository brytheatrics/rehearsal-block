import { redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { stripe } from "$lib/stripe";
import { supabaseAdmin } from "$lib/supabase/admin";

export const load: PageServerLoad = async ({ url, locals }) => {
  const sessionId = url.searchParams.get("session_id");

  if (!sessionId) {
    // Someone hit /buy/success without coming from Stripe. Bounce them.
    redirect(303, "/buy");
  }

  // Verify the session with Stripe and, as a fallback to the webhook,
  // mark the user paid immediately if they're signed in. The webhook will
  // also do this - this is belt-and-suspenders so the user sees their
  // unlocked app instantly even if the webhook is slow.
  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.payment_status === "paid") {
      const supabaseUserId = session.metadata?.supabase_user_id || session.client_reference_id;

      if (supabaseUserId) {
        await supabaseAdmin
          .from("profiles")
          .update({
            has_paid: true,
            stripe_customer_id: typeof session.customer === "string" ? session.customer : null,
          })
          .eq("id", supabaseUserId);
      }

      return {
        paid: true,
        email: session.customer_email,
        alreadySignedIn: !!locals.user,
      };
    }
  } catch (err) {
    console.error("Failed to verify Stripe session:", err);
  }

  return {
    paid: false,
    email: null,
    alreadySignedIn: !!locals.user,
  };
};
