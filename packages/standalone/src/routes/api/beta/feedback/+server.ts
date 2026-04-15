/**
 * POST /api/beta/feedback
 *
 * Body: { rating?: number, body: string, userAgent?: string }
 *
 * Inserts a row in beta_feedback attributed to the signed-in user.
 * RLS only allows users to insert their own feedback (user_id = auth.uid),
 * so this uses the request's Supabase client (not the admin client).
 */

import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) {
    return json({ error: "Not signed in." }, { status: 401 });
  }

  const payload = await request.json().catch(() => null);
  const body = typeof payload?.body === "string" ? payload.body.trim() : "";
  if (!body) {
    return json({ error: "Feedback body is required." }, { status: 400 });
  }
  if (body.length > 5000) {
    return json({ error: "Feedback is too long (max 5000 characters)." }, { status: 400 });
  }

  const rawRating = payload?.rating;
  let rating: number | null = null;
  if (typeof rawRating === "number" && Number.isFinite(rawRating)) {
    const r = Math.round(rawRating);
    if (r >= 1 && r <= 5) rating = r;
  }

  const userAgent = typeof payload?.userAgent === "string"
    ? payload.userAgent.slice(0, 500)
    : null;

  const { error } = await locals.supabase.from("beta_feedback").insert({
    user_id: locals.user.id,
    body,
    rating,
    user_agent: userAgent,
  });

  if (error) {
    return json({ error: "Couldn't save feedback. Try again." }, { status: 500 });
  }

  return json({ ok: true });
};
