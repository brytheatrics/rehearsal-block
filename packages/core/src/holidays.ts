/**
 * US federal holiday detection and custom holiday support.
 *
 * Provides a list of US federal holidays for a given year, plus
 * helpers to compute holidays within a show's date range.
 */

import type { IsoDate } from "./dates.js";
import { parseIsoDate } from "./dates.js";

export interface Holiday {
  date: IsoDate;
  name: string;
  /** "us" for auto-detected US holidays, "custom" for user-defined. */
  source: "us" | "custom";
}

/** Pad a number to 2 digits. */
function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

/** Format a UTC Date as IsoDate. */
function toIso(d: Date): IsoDate {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}` as IsoDate;
}

/** Get the Nth weekday of a given month/year (1-indexed). */
function nthWeekdayOf(year: number, month: number, weekday: number, n: number): Date {
  const first = new Date(Date.UTC(year, month, 1));
  const firstDay = first.getUTCDay();
  let day = 1 + ((weekday - firstDay + 7) % 7) + (n - 1) * 7;
  return new Date(Date.UTC(year, month, day));
}

/** Get the last Monday of a given month/year. */
function lastMondayOf(year: number, month: number): Date {
  const last = new Date(Date.UTC(year, month + 1, 0)); // last day of month
  const day = last.getUTCDay();
  const diff = (day - 1 + 7) % 7;
  return new Date(Date.UTC(year, month, last.getUTCDate() - diff));
}

/**
 * Returns US federal holidays for a given year.
 * Includes the major holidays that affect rehearsal scheduling.
 */
export function usHolidaysForYear(year: number): Holiday[] {
  const holidays: Holiday[] = [];

  // New Year's Day - Jan 1
  holidays.push({ date: toIso(new Date(Date.UTC(year, 0, 1))), name: "New Year's Day", source: "us" });

  // MLK Day - 3rd Monday of January
  holidays.push({ date: toIso(nthWeekdayOf(year, 0, 1, 3)), name: "MLK Day", source: "us" });

  // Presidents' Day - 3rd Monday of February
  holidays.push({ date: toIso(nthWeekdayOf(year, 1, 1, 3)), name: "Presidents' Day", source: "us" });

  // Memorial Day - Last Monday of May
  holidays.push({ date: toIso(lastMondayOf(year, 4)), name: "Memorial Day", source: "us" });

  // Juneteenth - June 19
  holidays.push({ date: toIso(new Date(Date.UTC(year, 5, 19))), name: "Juneteenth", source: "us" });

  // Independence Day - July 4
  holidays.push({ date: toIso(new Date(Date.UTC(year, 6, 4))), name: "Independence Day", source: "us" });

  // Labor Day - 1st Monday of September
  holidays.push({ date: toIso(nthWeekdayOf(year, 8, 1, 1)), name: "Labor Day", source: "us" });

  // Columbus Day - 2nd Monday of October
  holidays.push({ date: toIso(nthWeekdayOf(year, 9, 1, 2)), name: "Columbus Day", source: "us" });

  // Veterans Day - Nov 11
  holidays.push({ date: toIso(new Date(Date.UTC(year, 10, 11))), name: "Veterans Day", source: "us" });

  // Thanksgiving - 4th Thursday of November
  holidays.push({ date: toIso(nthWeekdayOf(year, 10, 4, 4)), name: "Thanksgiving", source: "us" });

  // Christmas - Dec 25
  holidays.push({ date: toIso(new Date(Date.UTC(year, 11, 25))), name: "Christmas", source: "us" });

  return holidays;
}

/**
 * Get all holidays (US + custom) within a date range.
 */
export function holidaysInRange(
  startDate: IsoDate,
  endDate: IsoDate,
  showUsHolidays: boolean,
  customHolidays: Array<{ date: IsoDate; name: string }>,
): Holiday[] {
  const results: Holiday[] = [];

  if (showUsHolidays) {
    const startYear = parseIsoDate(startDate).getUTCFullYear();
    const endYear = parseIsoDate(endDate).getUTCFullYear();
    for (let y = startYear; y <= endYear; y++) {
      for (const h of usHolidaysForYear(y)) {
        if (h.date >= startDate && h.date <= endDate) {
          results.push(h);
        }
      }
    }
  }

  for (const ch of customHolidays) {
    if (ch.date >= startDate && ch.date <= endDate) {
      results.push({ date: ch.date, name: ch.name, source: "custom" });
    }
  }

  return results.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/**
 * Build a Map from ISO date to holiday name for quick lookup.
 */
export function holidayMap(
  startDate: IsoDate,
  endDate: IsoDate,
  showUsHolidays: boolean,
  customHolidays: Array<{ date: IsoDate; name: string }>,
  hiddenHolidays: string[] = [],
): Map<IsoDate, string> {
  const hiddenSet = new Set(hiddenHolidays);
  const map = new Map<IsoDate, string>();
  for (const h of holidaysInRange(startDate, endDate, showUsHolidays, customHolidays).filter(h => !hiddenSet.has(h.name))) {
    // If multiple holidays on same date, join names
    const existing = map.get(h.date);
    map.set(h.date, existing ? `${existing}, ${h.name}` : h.name);
  }
  return map;
}
