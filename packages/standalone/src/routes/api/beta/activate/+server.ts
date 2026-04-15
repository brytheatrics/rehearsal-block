/**
 * POST /api/beta/activate
 *
 * Body: { code: string }
 *
 * Checks the submitted code against beta_config.beta_code (server-side,
 * service-role read). If it matches AND beta_config.beta_active is true,
 * sets profiles.has_beta_access = true for the signed-in user.
 *
 * Uses a constant-time compare so we don't leak code length via timing.
 * The code isn't a password, but the cost of doing this correctly is zero
 * and it future-proofs against the code becoming more sensitive.
 */

import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { supabaseAdmin } from "$lib/supabase/admin";

function timingSafeEqual(a: string, b: string): boolean {
  // Constant-time string compare. Pads the shorter to the longer's length
  // so we don't short-circuit on length differences.
  const maxLen = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < maxLen; i++) {
    const ca = i < a.length ? a.charCodeAt(i) : 0;
    const cb = i < b.length ? b.charCodeAt(i) : 0;
    diff |= ca ^ cb;
  }
  return diff === 0;
}

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) {
    error(401, "Not signed in.");
  }

  const body = await request.json().catch(() => null);
  const submittedCode = typeof body?.code === "string" ? body.code.trim() : "";
  if (!submittedCode) {
    return json({ error: "Enter the beta code." }, { status: 400 });
  }

  // Service-role read of beta_config - RLS hides this table from normal
  // authenticated clients.
  const { data: config, error: configError } = await supabaseAdmin
    .from("beta_config")
    .select("beta_code, beta_active")
    .eq("id", 1)
    .maybeSingle();

  if (configError || !config) {
    return json({ error: "Beta is not configured. Contact support." }, { status: 500 });
  }

  if (!config.beta_active) {
    return json({ error: "The beta period has ended." }, { status: 403 });
  }

  if (!timingSafeEqual(submittedCode, config.beta_code ?? "")) {
    return json({ error: "Invalid code. Check with Blake and try again." }, { status: 403 });
  }

  // Flip has_beta_access on the user's profile. Service-role bypasses RLS.
  const { error: updateError } = await supabaseAdmin
    .from("profiles")
    .update({ has_beta_access: true })
    .eq("id", locals.user.id);

  if (updateError) {
    return json({ error: "Couldn't update your profile. Try again." }, { status: 500 });
  }

  return json({ ok: true });
};
