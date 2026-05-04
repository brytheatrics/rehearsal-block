/**
 * Access gate for the Task Schedule feature.
 *
 * Task Schedule is a personal-use feature for technical directors
 * building shop schedules. It's not part of the standard product
 * offering, so the option to create one is hidden behind a hardcoded
 * email allowlist rather than a JWT custom claim or a paid tier.
 *
 * This is intentionally simple. When/if a second user actually needs
 * the feature, replace with a profile flag + JWT claim.
 */

const TASK_SCHEDULE_EMAILS = new Set<string>([
  "blakeryork@gmail.com",
  "blake@tacomalittletheatre.com",
]);

export function canCreateTaskSchedule(email: string | null | undefined): boolean {
  if (!email) return false;
  return TASK_SCHEDULE_EMAILS.has(email.trim().toLowerCase());
}
