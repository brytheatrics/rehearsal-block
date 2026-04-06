/**
 * Pure, UTC-safe date utilities for Rehearsal Block.
 *
 * All "ISO date" values are strings in the form "YYYY-MM-DD" (no time, no zone).
 * Internally we parse and format in UTC to avoid the day-off-by-one drift that
 * the TLT scheduler ran into when it used the browser's local timezone for
 * date math (TLT worked around it with a `T12:00:00` parse hack; we do it
 * properly instead).
 *
 * `todayIso()` is the one deliberate exception - "today" must match the wall
 * clock the user is looking at, so we read the local calendar day.
 */
/** ISO date string: "YYYY-MM-DD". Nominal type for clarity; runtime is just a string. */
export type IsoDate = string;

/** 0 = Sunday, 1 = Monday, ..., 6 = Saturday. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Parse "YYYY-MM-DD" into a UTC-midnight Date. Throws on malformed input. */
export function parseIsoDate(iso: IsoDate): Date {
  const m = ISO_RE.exec(iso);
  if (!m) throw new Error(`Invalid ISO date: ${iso}`);
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const d = new Date(Date.UTC(year, month - 1, day));
  // Guard against things like "2026-02-31" silently rolling forward.
  if (
    d.getUTCFullYear() !== year ||
    d.getUTCMonth() !== month - 1 ||
    d.getUTCDate() !== day
  ) {
    throw new Error(`Invalid ISO date: ${iso}`);
  }
  return d;
}

/** Format a Date as an ISO date string using its UTC components. */
export function formatIsoDate(d: Date): IsoDate {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Add `n` days to an ISO date (may be negative). */
export function addDays(iso: IsoDate, n: number): IsoDate {
  const d = parseIsoDate(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return formatIsoDate(d);
}

/** Lexicographic comparison works for ISO dates; wrapped for clarity. */
export function compareIso(a: IsoDate, b: IsoDate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function isIsoBefore(a: IsoDate, b: IsoDate): boolean {
  return a < b;
}

export function isIsoSameOrBefore(a: IsoDate, b: IsoDate): boolean {
  return a <= b;
}

export function isIsoAfter(a: IsoDate, b: IsoDate): boolean {
  return a > b;
}

export function isIsoSameOrAfter(a: IsoDate, b: IsoDate): boolean {
  return a >= b;
}

/** True if `iso` falls within [start, end] inclusive. */
export function isInRange(iso: IsoDate, start: IsoDate, end: IsoDate): boolean {
  return iso >= start && iso <= end;
}

/** Inclusive day count between two ISO dates. daysBetween("2026-05-01", "2026-05-03") === 3. */
export function daysBetween(a: IsoDate, b: IsoDate): number {
  const ms = parseIsoDate(b).getTime() - parseIsoDate(a).getTime();
  return Math.round(ms / 86_400_000) + 1;
}

/** 0 = Sunday .. 6 = Saturday, based on UTC. */
export function dayOfWeek(iso: IsoDate): Weekday {
  return parseIsoDate(iso).getUTCDay() as Weekday;
}

/** 0-indexed month (0 = January). */
export function monthOf(iso: IsoDate): number {
  return parseIsoDate(iso).getUTCMonth();
}

export function yearOf(iso: IsoDate): number {
  return parseIsoDate(iso).getUTCFullYear();
}

/**
 * Start of the week containing `iso`, given a week-start day.
 * weekStartsOn = 0 means weeks start Sunday, 1 means Monday.
 */
export function weekStartOf(iso: IsoDate, weekStartsOn: 0 | 1 = 0): IsoDate {
  const dow = dayOfWeek(iso);
  const delta = (dow - weekStartsOn + 7) % 7;
  return addDays(iso, -delta);
}

/** End of the week containing `iso` (6 days after weekStartOf). */
export function weekEndOf(iso: IsoDate, weekStartsOn: 0 | 1 = 0): IsoDate {
  return addDays(weekStartOf(iso, weekStartsOn), 6);
}

/** Today's local calendar day as an ISO date string. */
export function todayIso(now: Date = new Date()): IsoDate {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Human month label like "May 2026". Stable across locales via `en-US`. */
export function monthLabel(iso: IsoDate, locale = "en-US"): string {
  const d = parseIsoDate(iso);
  return new Intl.DateTimeFormat(locale, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(d);
}

/**
 * Weekday header labels, rotated so index 0 matches `weekStartsOn`.
 * Stable, locale-agnostic short names; UI can restyle casing as needed.
 */
export function weekdayHeaders(weekStartsOn: 0 | 1 = 0): string[] {
  const base = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return base.slice(weekStartsOn).concat(base.slice(0, weekStartsOn));
}

/** Yield every ISO date in [start, end] inclusive. */
export function eachDayOfRange(start: IsoDate, end: IsoDate): IsoDate[] {
  if (end < start) return [];
  const out: IsoDate[] = [];
  let cur = start;
  while (cur <= end) {
    out.push(cur);
    cur = addDays(cur, 1);
  }
  return out;
}
