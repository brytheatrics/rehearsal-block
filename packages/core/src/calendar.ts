/**
 * Framework-agnostic calendar grid builder.
 *
 * Produces a flat list of rows (month headers + week rows of 7 cells) that any
 * renderer - Svelte, print popup, test assertions - can walk without owning
 * any date math. This is the reactive replacement for TLT's
 * `buildCalendarGrid()`, which constructed DOM nodes directly.
 *
 * Rules (ported from TLT, with fixes):
 * - calStart = the first day of the week containing show.startDate
 * - calEnd   = the last day of the week containing show.endDate
 * - Days outside [show.startDate, show.endDate] are still emitted as cells
 *   with `inRange: false`; the renderer draws them as placeholders so the
 *   grid stays 7-wide and print alignment holds. (TLT lesson: never use
 *   `display: none` for out-of-range days.)
 * - A `month-header` row is inserted before the first week of each new
 *   calendar month, matching TLT's per-month print headers.
 * - Week start is configurable (0 = Sunday, 1 = Monday). TLT was Sunday-only.
 *
 * All date handling is UTC-based via `./dates.js`; no Date objects leak out.
 */

import type { Show } from "./types.js";
import {
  type IsoDate,
  addDays,
  dayOfWeek,
  isInRange,
  monthLabel,
  monthOf,
  parseIsoDate,
  todayIso,
  weekStartOf,
  weekdayHeaders,
  yearOf,
} from "./dates.js";

export interface CalendarCell {
  date: IsoDate;
  /** 1-31 */
  dayOfMonth: number;
  /** 0-indexed month (0 = January). */
  month: number;
  year: number;
  /** 0 = Sunday .. 6 = Saturday. */
  dayOfWeek: number;
  /** False for placeholder days outside the show's [startDate, endDate]. */
  inRange: boolean;
  /** Matches the user's local calendar day (see `todayIso`). */
  isToday: boolean;
}

export interface CalendarWeekRow {
  kind: "week";
  /** Always 7 cells, ordered left-to-right by the configured week start. */
  cells: CalendarCell[];
}

export interface CalendarMonthHeaderRow {
  kind: "month-header";
  /** e.g. "May 2026". */
  label: string;
  /** 0-indexed. */
  month: number;
  year: number;
}

export type CalendarRow = CalendarMonthHeaderRow | CalendarWeekRow;

export interface CalendarGrid {
  /** Interleaved month-header and week rows, in display order. */
  rows: CalendarRow[];
  /** Weekday labels rotated for the configured week start ("Sun".."Sat"). */
  weekdayHeaders: string[];
  /** Echoed back for convenience. */
  weekStartsOn: 0 | 1;
  /** First ISO date represented in the grid (may precede `show.startDate`). */
  calStart: IsoDate;
  /** Last ISO date represented in the grid (may follow `show.endDate`). */
  calEnd: IsoDate;
}

export interface BuildCalendarGridOptions {
  weekStartsOn?: 0 | 1;
  /**
   * ISO date considered "today" for `isToday` flags. Defaults to the local
   * calendar day. Injectable so tests and the print view can pin it.
   */
  today?: IsoDate;
}

/**
 * Build the calendar grid for a show.
 *
 * Pure: same input → same output. Does not read `Date.now()` unless
 * `options.today` is omitted.
 */
export function buildCalendarGrid(
  show: Show,
  options: BuildCalendarGridOptions = {},
): CalendarGrid {
  const weekStartsOn = options.weekStartsOn ?? 0;
  const today = options.today ?? todayIso();

  // Validate - parseIsoDate throws on bad input, giving callers a clear error
  // instead of silently producing a weird grid.
  parseIsoDate(show.startDate);
  parseIsoDate(show.endDate);
  if (show.endDate < show.startDate) {
    throw new Error(
      `Show endDate ${show.endDate} is before startDate ${show.startDate}`,
    );
  }

  const calStart = weekStartOf(show.startDate, weekStartsOn);
  // calEnd = end of the week containing show.endDate.
  const calEnd = addDays(weekStartOf(show.endDate, weekStartsOn), 6);

  const rows: CalendarRow[] = [];
  let currentWeek: CalendarCell[] = [];
  let lastEmittedMonthKey = "";

  let cursor: IsoDate = calStart;
  while (cursor <= calEnd) {
    const dow = dayOfWeek(cursor);
    const positionInWeek = (dow - weekStartsOn + 7) % 7;

    // At the start of every week, check whether we're crossing into a new
    // calendar month and, if so, emit a month-header row before the week.
    if (positionInWeek === 0) {
      const m = monthOf(cursor);
      const y = yearOf(cursor);
      const key = `${y}-${m}`;
      if (key !== lastEmittedMonthKey) {
        rows.push({
          kind: "month-header",
          label: monthLabel(cursor),
          month: m,
          year: y,
        });
        lastEmittedMonthKey = key;
      }
      currentWeek = [];
      rows.push({ kind: "week", cells: currentWeek });
    }

    const d = parseIsoDate(cursor);
    currentWeek.push({
      date: cursor,
      dayOfMonth: d.getUTCDate(),
      month: d.getUTCMonth(),
      year: d.getUTCFullYear(),
      dayOfWeek: dow,
      inRange: isInRange(cursor, show.startDate, show.endDate),
      isToday: cursor === today,
    });

    cursor = addDays(cursor, 1);
  }

  return {
    rows,
    weekdayHeaders: weekdayHeaders(weekStartsOn),
    weekStartsOn,
    calStart,
    calEnd,
  };
}

/** Narrowing helper for consumers walking `grid.rows`. */
export function isWeekRow(row: CalendarRow): row is CalendarWeekRow {
  return row.kind === "week";
}

export function isMonthHeaderRow(
  row: CalendarRow,
): row is CalendarMonthHeaderRow {
  return row.kind === "month-header";
}
