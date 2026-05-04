/**
 * Tacoma Little Theatre holiday defaults for Task Schedule mode.
 *
 * Blake's TD work observes a specific subset of US federal holidays plus
 * two non-federal ones (Black Friday, Christmas Eve). When a task schedule
 * is created, these defaults are seeded into the doc so he doesn't have
 * to type them each time.
 *
 * Personal-use only - guarded by the email allowlist on the create-show
 * flow. See `task-schedule-access.ts`.
 */

import { parseIsoDate } from "@rehearsal-block/core";

/**
 * Federal holiday names that TLT does NOT observe. Listed in
 * `Settings.hiddenHolidays` so US-holiday rendering skips them while the
 * remaining federal ones (New Years, MLK, Juneteenth, Independence,
 * Labor, Thanksgiving, Christmas) flow through normally.
 *
 * Names must match the `name` strings emitted by `usHolidaysForYear` in
 * `packages/core/src/holidays.ts` exactly.
 */
export const TLT_HIDDEN_FEDERAL_HOLIDAY_NAMES = [
  "Presidents' Day",
  "Memorial Day",
  "Columbus Day",
  "Veterans Day",
] as const;

function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

function toIso(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** Compute the 4th Thursday of November for a given year. */
function thanksgivingOf(year: number): Date {
  // Nov = month index 10. Thursday = weekday 4. 4th occurrence.
  const first = new Date(Date.UTC(year, 10, 1));
  const firstDay = first.getUTCDay();
  const day = 1 + ((4 - firstDay + 7) % 7) + (4 - 1) * 7;
  return new Date(Date.UTC(year, 10, day));
}

/**
 * Compute the TLT-specific non-federal holidays (Black Friday, Christmas
 * Eve) for every year that overlaps a show's date range. Returned in the
 * shape `Settings.customHolidays` expects.
 */
export function tltExtraHolidaysInRange(
  startDate: string,
  endDate: string,
): Array<{ date: string; name: string }> {
  const startYear = parseIsoDate(startDate).getUTCFullYear();
  const endYear = parseIsoDate(endDate).getUTCFullYear();
  const out: Array<{ date: string; name: string }> = [];
  for (let y = startYear; y <= endYear; y++) {
    const thanksgiving = thanksgivingOf(y);
    const blackFriday = new Date(
      Date.UTC(y, thanksgiving.getUTCMonth(), thanksgiving.getUTCDate() + 1),
    );
    out.push({ date: toIso(blackFriday), name: "Black Friday" });
    out.push({ date: toIso(new Date(Date.UTC(y, 11, 24))), name: "Christmas Eve" });
  }
  return out;
}
