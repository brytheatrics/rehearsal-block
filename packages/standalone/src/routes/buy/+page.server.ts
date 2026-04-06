import { fail, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { stripe } from "$lib/stripe";
import { PUBLIC_SITE_URL, PUBLIC_STRIPE_PRICE_ID } from "$env/static/public";

export const load: PageServerLoad = async ({ locals, url }) => {
  // If already paid, bounce to the app
  if (locals.user && locals.profile?.has_paid) {
    redirect(303, "/app");
  }
  return {
    alreadySignedIn: !!locals.user,
    email: locals.user?.email ?? null,
  };
};

export const actions: Actions = {
  checkout: async ({ locals, url }) => {
    // Build the success and cancel URLs. Prefer the actual request origin
    // over PUBLIC_SITE_URL so preview deploys work correctly too.
    const origin = url.origin || PUBLIC_SITE_URL;

    // Try to create the Stripe Checkout session. Any errors here stay inside
    // the try/catch. The redirect below MUST NOT be wrapped in try/catch -
    // SvelteKit's `redirect()` throws a Redirect object that would be caught
    // here and mistaken for an error.
    let session;
    try {
      session = await stripe.checkout.sessions.create({
        mode: "payment",
        payment_method_types: ["card"],
        line_items: [
          {
            price: PUBLIC_STRIPE_PRICE_ID,
            quantity: 1,
          },
        ],
        // If the user is already signed in, prefill email and tag the session
        // so the webhook can match them back.
        customer_email: locals.user?.email ?? undefined,
        client_reference_id: locals.user?.id ?? undefined,
        metadata: {
          supabase_user_id: locals.user?.id ?? "",
        },
        success_url: `${origin}/buy/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/buy?canceled=1`,
        allow_promotion_codes: true,
      });
    } catch (err) {
      console.error("Stripe checkout session create failed:", err);
      return fail(500, { error: "Could not start checkout. Please try again." });
    }

    if (!session.url) {
      console.error("Stripe returned a session with no URL:", session.id);
      return fail(500, { error: "Stripe did not return a checkout URL." });
    }

    // redirect() throws - must be OUTSIDE the try/catch above.
    redirect(303, session.url);
  },
};
