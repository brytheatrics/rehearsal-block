/**
 * POST /api/refund-request - Request a refund.
 *
 * Checks show_activity for disqualifying actions (exported_json,
 * downloaded_pdf, published_share). If none found within the 7-day
 * window, initiates a Stripe refund and triggers account deletion.
 */

import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { supabaseAdmin } from "$lib/supabase/admin.js";
import { stripe } from "$lib/stripe";

const REFUND_WINDOW_DAYS = 7;
const DISQUALIFYING_ACTIONS = ["exported_json", "downloaded_pdf", "published_share"];

export const POST: RequestHandler = async ({ locals }) => {
  const user = locals.user;
  if (!user) throw error(401, "Not authenticated");

  const profile = locals.profile;
  if (!profile?.has_paid) {
    throw error(400, "No purchase found for this account.");
  }

  // Check refund window (7 days from account creation)
  const createdAt = new Date(profile.created_at);
  const now = new Date();
  const daysSincePurchase = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24);

  if (daysSincePurchase > REFUND_WINDOW_DAYS) {
    throw error(403, `The ${REFUND_WINDOW_DAYS}-day refund window has passed.`);
  }

  // Check for disqualifying actions
  const { data: activity } = await supabaseAdmin
    .from("show_activity")
    .select("action, created_at")
    .eq("user_id", user.id)
    .in("action", DISQUALIFYING_ACTIONS)
    .limit(1);

  if (activity && activity.length > 0) {
    const action = activity[0]!.action;
    const actionLabels: Record<string, string> = {
      exported_json: "exported show data as JSON",
      downloaded_pdf: "downloaded a PDF",
      published_share: "published a share link",
    };
    const label = actionLabels[action] ?? action;
    throw error(403, `Refund is not available because you've ${label}, which voids the refund window per our terms.`);
  }

  // Initiate Stripe refund
  if (!profile.stripe_customer_id) {
    throw error(400, "No Stripe customer found. Please contact support.");
  }

  try {
    // Find the payment intent for this customer
    const charges = await stripe.charges.list({
      customer: profile.stripe_customer_id,
      limit: 1,
    });

    if (!charges.data.length) {
      throw error(400, "No charge found. Please contact support.");
    }

    const charge = charges.data[0]!;
    await stripe.refunds.create({
      charge: charge.id,
      reason: "requested_by_customer",
    });
  } catch (err: any) {
    if (err.status) throw err; // re-throw SvelteKit errors
    console.error("Stripe refund failed:", err);
    throw error(500, "Refund could not be processed. Please contact support.");
  }

  // Flip has_paid to false
  await supabaseAdmin
    .from("profiles")
    .update({ has_paid: false })
    .eq("id", user.id);

  // The account deletion will be triggered by the charge.refunded
  // webhook (or can be done manually). For now, just revoke access.

  return json({
    ok: true,
    message: "Refund initiated. Your access has been revoked and the refund will appear on your statement within 5-10 business days.",
  });
};
