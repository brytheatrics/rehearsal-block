/**
 * Client-side Sentry initialization. Captures browser JS errors and
 * unhandled promise rejections. Wired into SvelteKit's handleError hook
 * so component render errors are also captured.
 */

import * as Sentry from "@sentry/sveltekit";
import { PUBLIC_SENTRY_DSN } from "$env/static/public";

// Skip Sentry on localhost / local previews so Blake's dev iterations
// don't flood the issues list and generate notification spam. Production
// (anything not localhost) still reports.
const isDev =
  typeof window !== "undefined" &&
  (window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1" ||
    window.location.hostname.endsWith(".local"));

if (PUBLIC_SENTRY_DSN && !isDev) {
  Sentry.init({
    dsn: PUBLIC_SENTRY_DSN,
    // No performance monitoring - saves event quota
    tracesSampleRate: 0,
    // Filter out expected/non-actionable errors
    beforeSend(event) {
      const msg = event.exception?.values?.[0]?.value ?? "";
      // PaywallError is expected in demo mode
      if (msg.includes("PaywallError") || msg.includes("requires a paid account")) {
        return null;
      }
      // Network errors when offline are expected
      if (msg.includes("Failed to fetch") || msg.includes("NetworkError") || msg.includes("Load failed")) {
        return null;
      }
      return event;
    },
  });
}

export const handleError = Sentry.handleErrorWithSentry();
