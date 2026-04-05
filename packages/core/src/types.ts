/**
 * Rehearsal Block — core data model types.
 *
 * These types describe the shape of a single "show" document that lives
 * in localStorage (free/demo) or Supabase (paid users). They are shared
 * between the standalone app and (eventually) the TLT package.
 *
 * IMPORTANT: when changing these types, increment `DOCUMENT_VERSION` and
 * add a migration. Existing user documents in production depend on this shape.
 */

export const DOCUMENT_VERSION = "1.0" as const;

// ------------------------------------------------------------------
// Show metadata
// ------------------------------------------------------------------

export interface Show {
  name: string;
  startDate: string; // ISO date, e.g. "2026-07-06"
  endDate: string; // ISO date
}

// ------------------------------------------------------------------
// Cast + groups
// ------------------------------------------------------------------

export interface CastMember {
  id: string;
  character: string;
  firstName: string;
  lastName: string;
  email?: string;
  color: string; // hex, e.g. "#1565c0"
}

export interface Group {
  id: string;
  name: string; // e.g. "Ensemble", "Leads", "Dancers"
  memberIds: string[]; // CastMember ids
}

// ------------------------------------------------------------------
// Event types (badges)
// ------------------------------------------------------------------

export interface EventType {
  id: string;
  name: string; // "Rehearsal", "Tech", "Dress Rehearsal", etc.
  bgColor: string;
  textColor: string;
  defaultStart?: string; // "HH:MM"
  defaultEnd?: string;
  /** When true, the day-editor switches into call-block mode (no checklist, hide end time, etc.). */
  isDressPerf: boolean;
}

// ------------------------------------------------------------------
// Schedule days + calls
// ------------------------------------------------------------------

/**
 * A single "call" inside a rehearsal day. Most rehearsal days have exactly
 * one unlabeled call. Dress/performance days have multiple labeled calls
 * (Crew Call, Actor Call, Orchestra Call, etc.).
 *
 * This shape comes from a painful lesson in the TLT scheduler, which
 * crammed crew call into block 0 and actor calls into extra blocks. Model
 * it uniformly from the start.
 */
export interface Call {
  id: string;
  label: string; // "" for unlabeled rehearsals, "Crew Call"/"Actor Call"/etc. for dress/perf
  time: string; // "HH:MM"
  endTime?: string; // only used on normal rehearsals, not dress/perf
  calledActorIds: string[];
  calledGroupIds: string[];
}

export interface ScheduleDay {
  eventTypeId: string;
  calls: Call[];
  description: string; // "Blocking Act 1", etc.
  notes: string; // HTML from contenteditable editor
  location: string;
}

// ------------------------------------------------------------------
// Conflicts + locations + settings
// ------------------------------------------------------------------

export interface Conflict {
  id: string;
  actorId: string;
  date: string; // ISO date
  label: string; // "Work", "Sick", "Family", etc.
}

export type CastDisplayMode = "actor" | "character" | "both";

export interface Settings {
  fontFamily: string;
  castDisplayMode: CastDisplayMode;
  weekStartsOn: 0 | 1; // 0 = Sunday, 1 = Monday
}

// ------------------------------------------------------------------
// Root document (one per show)
// ------------------------------------------------------------------

export interface ScheduleDoc {
  version: typeof DOCUMENT_VERSION;
  show: Show;
  cast: CastMember[];
  groups: Group[];
  eventTypes: EventType[];
  /** Keyed by ISO date "YYYY-MM-DD". */
  schedule: Record<string, ScheduleDay>;
  conflicts: Conflict[];
  locationPresets: string[];
  settings: Settings;
}
