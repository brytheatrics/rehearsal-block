/**
 * Server-side Stripe client.
 *
 * Only import this from server code (+page.server.ts, +server.ts, hooks.server.ts).
 * Never import from client components or .ts files that run in the browser -
 * it uses the secret key, which must never leave the server.
 */

import Stripe from "stripe";
import { STRIPE_SECRET_KEY } from "$env/static/private";

// Use the SDK's default apiVersion (pinned by the installed Stripe package).
// We don't pass apiVersion explicitly - whenever we bump `stripe` in
// package.json, the SDK updates to match, and the pinned API version moves
// with it. Explicit version strings drift out of sync with the SDK types.
export const stripe = new Stripe(STRIPE_SECRET_KEY, {
  typescript: true,
  appInfo: {
    name: "Rehearsal Block",
    version: "0.1.0",
    url: "https://blakeryork.com",
  },
});
