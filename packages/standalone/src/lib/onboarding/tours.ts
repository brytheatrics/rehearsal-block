/**
 * Tour step definitions for the onboarding overlay.
 *
 * Keep tour ids stable - they're the keys stored in IndexedDB to track
 * completion. If you rename a tour, existing users' completion records
 * won't match and they'll see the "new" tour on next visit. Usually
 * what you want when a tour has meaningfully changed, but be deliberate.
 *
 * Plan reference: ~/.claude/plans/onboarding-tour.md
 */

import type { TourStep } from "$lib/components/OnboardingTour.svelte";

/** Show-list tour - fires on first /app visit with no shows. */
export const SHOW_LIST_TOUR: TourStep[] = [
  {
    target: null,
    title: "Welcome to Rehearsal Block",
    body: "Let's get your first show set up. We'll walk you through the key parts in under a minute.",
  },
  {
    target: "[data-tour='new-show']",
    title: "Create your first show",
    body: "Click here to start. You'll name it, pick start and end dates, and optionally configure settings - or skip straight to the schedule if you want.",
    placement: "bottom",
  },
  {
    target: "[data-tour='my-defaults']",
    title: "Your Defaults",
    body: "Set your preferred weekdays, event types, and holidays once here - every new show inherits them automatically. You can still override them per-show.",
    placement: "bottom",
  },
];

/* Tour 2 (new-show-modal) and Tour 3 (schedule-editor) are described in
   the plan file but not yet implemented - they'll live here once built. */
