/**
 * Pure helpers for reading from `ScheduleDay` + `Call` records.
 *
 * The "effective" helpers resolve per-call overrides against day-level
 * defaults: if a Call has its own `description` or `location`, that wins;
 * otherwise the ScheduleDay's value is used. This keeps UIs simple - they
 * always ask "what should I show for this call?" instead of branching.
 *
 * `expandCalledActorIds` turns (calledActorIds + calledGroupIds) into the
 * full, deduplicated set of CastMember ids for a call. Useful for print
 * views, conflict checks, and the double-booking detector.
 */

import { dayOfWeek, type IsoDate } from "./dates.js";
import type {
  Call,
  CastMember,
  Conflict,
  Group,
  ScheduleDay,
  Settings,
} from "./types.js";

/**
 * Palette for auto-assigning cast member colors. Distinct from the event
 * type palette (which uses pastel bg + saturated text pairs). These are
 * solid, saturated colors that read well as small dots and chip borders.
 * Round-robin assigned: the Nth actor gets `CAST_COLOR_PALETTE[N % length]`.
 */
export const CAST_COLOR_PALETTE: readonly string[] = [
  "#1565c0", // blue
  "#c2185b", // pink
  "#6a1b9a", // purple
  "#d84315", // deep orange
  "#2e7d32", // green
  "#00838f", // teal
  "#5d4037", // brown
  "#e65100", // orange
  "#283593", // indigo
  "#424242", // slate
  "#00695c", // dark teal
  "#ad1457", // magenta
  "#f9a825", // amber
  "#0277bd", // light blue
  "#558b2f", // light green
  "#8e24aa", // deep purple
  "#ef6c00", // tangerine
  "#00897b", // medium teal
  "#c62828", // red
  "#4527a0", // violet
  "#9e9d24", // olive
  "#00acc1", // cyan
  "#6d4c41", // warm brown
  "#d81b60", // rose
  "#1b5e20", // forest green
  "#ff6f00", // dark amber
  "#0d47a1", // navy
  "#4e342e", // espresso
  "#7b1fa2", // orchid
  "#37474f", // charcoal
] as const;

/**
 * Matched bg/text color pairs for event type badges. Chosen so the pale
 * background reads as a pastel pill and the darker text stays legible on
 * both the in-grid badge and the editor-toolbar pill. Directors pick one
 * of these in the Defaults modal instead of typing hex codes.
 */
export interface EventTypeColor {
  bgColor: string;
  textColor: string;
  /** Short label used for screen readers / tooltips. */
  name: string;
}

export const EVENT_TYPE_COLOR_PALETTE: readonly EventTypeColor[] = [
  { name: "Blue", bgColor: "#e3f2fd", textColor: "#1565c0" },
  { name: "Green", bgColor: "#e8f5e9", textColor: "#2e7d32" },
  { name: "Orange", bgColor: "#fff3e0", textColor: "#e65100" },
  { name: "Purple", bgColor: "#f3e5f5", textColor: "#6a1b9a" },
  { name: "Teal", bgColor: "#e0f2f1", textColor: "#00695c" },
  { name: "Pink", bgColor: "#fce4ec", textColor: "#c2185b" },
  { name: "Red", bgColor: "#ffebee", textColor: "#c62828" },
  { name: "Yellow", bgColor: "#fffde7", textColor: "#f9a825" },
  { name: "Brown", bgColor: "#efebe9", textColor: "#5d4037" },
  { name: "Slate", bgColor: "#eceff1", textColor: "#546e7a" },
  { name: "Indigo", bgColor: "#e8eaf6", textColor: "#283593" },
  { name: "Lime", bgColor: "#f0f4c3", textColor: "#827717" },
  { name: "Cyan", bgColor: "#e0f7fa", textColor: "#00838f" },
  { name: "Deep Orange", bgColor: "#fbe9e7", textColor: "#bf360c" },
  { name: "Amber", bgColor: "#fff8e1", textColor: "#ff8f00" },
  { name: "Rose", bgColor: "#fce4ec", textColor: "#ad1457" },
  { name: "Forest", bgColor: "#e8f5e9", textColor: "#1b5e20" },
  { name: "Charcoal", bgColor: "#f5f5f5", textColor: "#37474f" },
] as const;

/**
 * Default palette for auto-assigned location colors. Chosen to be readable
 * as text on a white background and visually distinct from the cast chip
 * colors in sample-show.ts.
 */
export const LOCATION_COLOR_PALETTE: readonly string[] = [
  "#1565c0", // blue
  "#2e7d32", // green
  "#e65100", // orange
  "#6a1b9a", // purple
  "#00838f", // teal
  "#c2185b", // pink
  "#5d4037", // brown
  "#455a64", // slate
] as const;

/**
 * Deterministic color for a location name. Same name always gets the same
 * palette slot, so "Main Stage" stays blue every time it appears, and the
 * director never has to pick a color manually. Unknown or empty names
 * return `null` so the renderer can fall back to default text color.
 *
 * This is intentionally a simple string hash, not cryptographic - collisions
 * between two locations in the same show are visually distracting but not
 * catastrophic, and the palette is large enough that short shows won't hit
 * them in practice.
 */
export function locationColor(
  name: string,
  palette: readonly string[] = LOCATION_COLOR_PALETTE,
): string | null {
  const key = name.trim().toLowerCase();
  if (!key || palette.length === 0) return null;
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) | 0;
  }
  const idx = Math.abs(hash) % palette.length;
  return palette[idx] ?? null;
}

/** Effective description: call override → day default → "". */
export function effectiveDescription(day: ScheduleDay, call: Call): string {
  const c = call.description?.trim();
  if (c) return c;
  return day.description;
}

/** Effective location: call override → day default → "". */
export function effectiveLocation(day: ScheduleDay, call: Call): string {
  const c = call.location?.trim();
  if (c) return c;
  return day.location;
}

/**
 * Returns the deduplicated set of cast member ids called for a single
 * call, expanding any referenced groups into their members. Does NOT
 * account for `allCalled` - callers who need the effective roster
 * including all-called behavior should use `effectiveCalledActorIds`.
 */
export function expandCalledActorIds(
  call: Call,
  groups: Group[],
): Set<string> {
  const ids = new Set<string>(call.calledActorIds);
  for (const gid of call.calledGroupIds) {
    const g = groups.find((x) => x.id === gid);
    if (g) for (const mid of g.memberIds) ids.add(mid);
  }
  return ids;
}

/**
 * Effective roster for a call, honoring `allCalled`. When the flag is
 * set every cast member is implicitly called; conflicts are still
 * resolved later at render time so blocked actors don't appear. This
 * is the source of truth for conflict / overlap / print computations.
 */
export function effectiveCalledActorIds(
  call: Call,
  cast: readonly CastMember[],
  groups: Group[],
): Set<string> {
  if (call.allCalled) return new Set(cast.map((m) => m.id));
  return expandCalledActorIds(call, groups);
}

/**
 * Union of actor ids called across every call on a day. Used by day-cell
 * chip rendering where we don't care which specific call an actor was
 * called for.
 */
export function allCalledActorIdsForDay(
  day: ScheduleDay,
  groups: Group[],
): Set<string> {
  const out = new Set<string>();
  for (const call of day.calls) {
    for (const id of expandCalledActorIds(call, groups)) out.add(id);
  }
  return out;
}

/**
 * Resolve the default call times for a given ISO date using the show's
 * per-weekday settings. Returns `null` when the weekday is marked
 * disabled (the director hasn't declared a default for that weekday, so
 * new days should not pre-fill a time - they can start as dark or pick
 * a time manually).
 */
export function getDefaultCallTimes(
  settings: Settings,
  date: IsoDate,
): { startTime: string; endTime: string } | null {
  const wd = dayOfWeek(date);
  const def = settings.weekdayDefaults?.[wd];
  if (!def || !def.enabled) return null;
  return { startTime: def.startTime, endTime: def.endTime };
}

/** Length-7 array of disabled weekday defaults, used as the safe fallback. */
export function emptyWeekdayDefaults(): Settings["weekdayDefaults"] {
  return Array.from({ length: 7 }, () => ({
    enabled: false,
    startTime: "19:00",
    endTime: "21:30",
  }));
}

/** Parse "HH:MM" into minutes since midnight. NaN on malformed input. */
function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return Number.NaN;
  return (h as number) * 60 + (m as number);
}

/**
 * True if two calls overlap in time. A call without `endTime` is treated
 * as a zero-duration point and only overlaps strictly-containing ranges
 * (so Dress/Perf point calls at 17:00 and 18:00 don't spuriously clash).
 *
 * Strict `<` comparisons mean two calls that merely touch at an endpoint
 * (e.g. 7:00–8:00 and 8:00–9:30) are NOT considered overlapping - the
 * actor walks straight from one to the next, which is what a director
 * setting up sequential calls expects.
 */
export function callsOverlap(a: Call, b: Call): boolean {
  const aStart = toMinutes(a.time);
  const bStart = toMinutes(b.time);
  if (!Number.isFinite(aStart) || !Number.isFinite(bStart)) return false;
  const aEnd = a.endTime ? toMinutes(a.endTime) : aStart;
  const bEnd = b.endTime ? toMinutes(b.endTime) : bStart;
  return aStart < bEnd && bStart < aEnd;
}

/**
 * Does a conflict cover a specific call? A full-day conflict (no times)
 * blocks every call on its date. A timed conflict only blocks calls whose
 * time range overlaps the conflict window using the same strict-adjacency
 * rule as `callsOverlap` - a conflict that ends exactly when a call
 * starts does NOT block it.
 */
export function conflictBlocksCall(conflict: Conflict, call: Call): boolean {
  if (!conflict.startTime || !conflict.endTime) return true;
  return callsOverlap(
    {
      id: `__conflict_${conflict.id}__`,
      label: "",
      time: conflict.startTime,
      endTime: conflict.endTime,
      calledActorIds: [],
      calledGroupIds: [],
    },
    call,
  );
}

/**
 * Return the subset of conflicts that block a given (actor, call) pair.
 * Empty array means the actor is free to be called.
 */
export function blockingConflictsFor(
  actorId: string,
  call: Call,
  dateConflicts: Conflict[],
): Conflict[] {
  return dateConflicts.filter(
    (c) => c.actorId === actorId && conflictBlocksCall(c, call),
  );
}

/**
 * For each actor on a day, return a map from "call index they're in" to
 * "indexes of OTHER calls that actor is also in AND whose time ranges
 * overlap with this call". Only entries where an actual time conflict
 * exists are included - sequential calls (7–8 and 8–9:30) don't flag.
 *
 * Shape: `Map<actorId, Map<callIndex, number[]>>`
 *
 * The editor reads this per (actor, call) pair to decide whether to show
 * the "also called in…" warning on that row.
 */
export function overlappingCallsByActor(
  day: ScheduleDay,
  groups: Group[],
  cast: readonly CastMember[] = [],
): Map<string, Map<number, number[]>> {
  // Step 1: which call indexes is each actor in? Honors `allCalled` so
  // "everyone" calls correctly enumerate the whole cast when checking
  // for overlapping commitments.
  const actorCalls = new Map<string, number[]>();
  day.calls.forEach((call, idx) => {
    const ids = call.allCalled
      ? new Set(cast.map((m) => m.id))
      : expandCalledActorIds(call, groups);
    for (const id of ids) {
      const arr = actorCalls.get(id) ?? [];
      arr.push(idx);
      actorCalls.set(id, arr);
    }
  });

  // Step 2: for each actor with >= 2 calls, keep only overlapping pairs.
  const out = new Map<string, Map<number, number[]>>();
  for (const [actorId, idxs] of actorCalls) {
    if (idxs.length < 2) continue;
    const perCall = new Map<number, number[]>();
    for (const i of idxs) {
      const callI = day.calls[i];
      if (!callI) continue;
      const overlaps: number[] = [];
      for (const j of idxs) {
        if (i === j) continue;
        const callJ = day.calls[j];
        if (!callJ) continue;
        if (callsOverlap(callI, callJ)) overlaps.push(j);
      }
      if (overlaps.length > 0) perCall.set(i, overlaps);
    }
    if (perCall.size > 0) out.set(actorId, perCall);
  }
  return out;
}
