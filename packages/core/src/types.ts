/**
 * Rehearsal Block - core data model types.
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
  firstName: string;
  middleName?: string; // full middle name or just an initial
  lastName: string;
  suffix?: string; // "Jr.", "III", "Sr.", etc.
  character: string;
  pronouns?: string; // free text: "he/him", "they/them", etc.
  email?: string;
  phone?: string; // free text
  color: string; // hex, e.g. "#1565c0"
}

export interface CrewMember {
  id: string;
  firstName: string;
  middleName?: string;
  lastName: string;
  suffix?: string;
  role: string; // "Stage Manager", "Lighting Designer", etc.
  pronouns?: string;
  email?: string;
  phone?: string;
  color: string;
}

export interface Group {
  id: string;
  name: string; // e.g. "Ensemble", "Leads", "Dancers"
  memberIds: string[]; // CastMember ids
  color?: string; // hex - when set, overrides the auto-derived color
}

// ------------------------------------------------------------------
// Event types (badges)
// ------------------------------------------------------------------

export interface EventType {
  id: string;
  name: string; // "Rehearsal", "Tech", "Dress Rehearsal", etc.
  bgColor: string;
  textColor: string;
  /** When true, the day-editor switches into call-block mode (no checklist, hide end time, etc.). */
  isDressPerf: boolean;
}

// ------------------------------------------------------------------
// Schedule days + calls
// ------------------------------------------------------------------

/**
 * A single "call" inside a rehearsal day. Most rehearsal days have one
 * unlabeled call. Dress/performance days have multiple labeled calls
 * (Crew Call, Actor Call, Orchestra Call, etc.). A director can also
 * break a normal rehearsal into parallel or sequential calls - e.g.
 * 7–8 Fight Choreo on Main Stage, 7–9:30 Dance in Rehearsal Hall, each
 * with their own roster.
 *
 * `description` and `location` are optional overrides: when set on a
 * call, they win for that call; when left blank, the day-level values
 * serve as defaults so a director can type "Main Stage" once on the day
 * and have every call inherit it.
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
  /** Per-call override; falls back to ScheduleDay.description when blank. */
  description?: string;
  /** Per-call override; falls back to ScheduleDay.location when blank. */
  location?: string;
  calledActorIds: string[];
  calledCrewIds?: string[];
  calledGroupIds: string[];
  /**
   * The word after the label on dress/perf calls. Defaults to "Call"
   * when absent, giving "Crew Call", "Actor Call". A director can
   * change it per-call to "Check" ("Mic Check"), "Time", or anything
   * else. Stored per-call so one day can have "Crew Call" and "Mic
   * Check" side by side.
   */
  suffix?: string;
  /**
   * When true the call includes every non-conflicted cast member. The
   * grid renders ONE maroon "All Called" chip instead of expanding into
   * individuals or group chips. Mutually additive with calledActorIds
   * and calledGroupIds: if all three are set the effective roster is
   * still "everyone", but the user's explicit picks are preserved if
   * they later un-toggle all-called.
   */
  allCalled?: boolean;
  /**
   * Set when the user explicitly added this call via the right-side
   * day-tool sidebar's Call chip. Forces the call to render in the grid
   * even when otherwise empty (no actors, no description), so the user
   * gets immediate visual feedback after the drop.
   */
  manuallyAdded?: boolean;
}

export interface ScheduleDay {
  eventTypeId: string;
  /**
   * Additional event types for this day beyond the primary. The primary
   * `eventTypeId` controls behavior (dress/perf mode, default times,
   * mini-cal assignments). Secondary types are visual labels - they
   * render as extra badges on the grid cell so a director can mark a
   * day as both "Blocking" and "Fight" without needing separate calls.
   * Ctrl+click a pill in the editor to toggle it as a secondary.
   */
  secondaryTypeIds?: string[];
  calls: Call[];
  /** Day-level default description; each call can override. */
  description: string;
  notes: string; // HTML from contenteditable editor
  /** Day-level default location; each call can override. */
  location: string;
  /**
   * Additional locations to display in the day's location footer beyond
   * `location` and any per-call locations. Used when the user drags a
   * second (or third...) location chip onto the day at the cell level
   * after `location` is already set: the new location is added here so
   * it appears in the footer without recoloring any existing calls. The
   * user can then drag any of these locations onto a specific call to
   * assign it. Deduped against `location` and call locations at render
   * time.
   */
  extraLocations?: string[];
  /**
   * Curtain time for dress/performance days. "HH:MM" format, displayed
   * below the event badge in the grid and at the top of the editor
   * panel. Only meaningful when the day's event type has `isDressPerf`
   * set; ignored for normal rehearsal days.
   */
  curtainTime?: string;
}

// ------------------------------------------------------------------
// Conflicts + locations + settings
// ------------------------------------------------------------------

/**
 * A single scheduling conflict: "this actor cannot be at rehearsal on
 * this date (or during this window)". Directors enter conflicts manually
 * per-day while building the schedule.
 *
 * `startTime`/`endTime` are both optional. When both are set, the
 * conflict is a window (e.g. "5–7pm, class"). When either is missing,
 * the conflict covers the whole rehearsal day - this is the common case
 * for "out of town", "sick", "work trip", etc.
 */
export interface Conflict {
  id: string;
  actorId: string;
  date: string; // ISO date
  label: string; // "Work", "Sick", "Family", etc. - may be ""
  /** HH:MM. Optional; paired with `endTime` to scope to a time window. */
  startTime?: string;
  /** HH:MM. Optional; paired with `startTime`. */
  endTime?: string;
}

export type CastDisplayMode = "actor" | "character" | "both";
export type CrewDisplayMode = "name" | "role" | "both";

/**
 * Per-weekday call-time default. One entry per weekday (0 = Sunday). When
 * `enabled` is true, newly-created days on that weekday seed their first
 * call with `startTime`/`endTime`. When `enabled` is false the weekday is
 * treated as a "dark" default - new days get no pre-filled call time and
 * the director must set it explicitly.
 *
 * Stored in `Settings.weekdayDefaults` as a length-7 array indexed by the
 * JS `Date.getUTCDay()` value, so consumers never have to match by
 * weekday number lookup.
 */
export interface WeekdayDefault {
  enabled: boolean;
  startTime: string; // "HH:MM"
  endTime: string;
}

export interface Settings {
  fontFamily: string;
  castDisplayMode: CastDisplayMode;
  crewDisplayMode: CrewDisplayMode;
  weekStartsOn: 0 | 1; // 0 = Sunday, 1 = Monday
  /** Length 7, indexed by JS weekday (0 = Sunday). */
  weekdayDefaults: WeekdayDefault[];
  /** Show-wide default location inherited by new days; "" for none. */
  defaultLocation: string;
  /** Show-wide default event type inherited by new days; "" for none (uses first). */
  defaultEventType: string;
  /**
   * Granularity of the time picker dropdowns, in minutes. Controls how
   * many options appear in every TimePicker across the app (call times,
   * weekday defaults, conflicts). Typical values: 5, 10, 15, 30.
   */
  timeIncrementMinutes: number;
  /**
   * How far before curtain time to show call options for dress/perf
   * days, in minutes. For example, 150 (2.5 hours) means call time
   * pickers on dress/perf days only show times between curtain minus
   * this value and curtain time. Matches TLT's "2.5 hour rule" but
   * is now configurable.
   */
  dressCallWindowMinutes: number;
  /** "12h" for 7:00 PM, "24h" for 19:00. Affects every time display
   *  and picker across the app. */
  timeFormat: "12h" | "24h";
  /** Overall UI density. "compact" tightens spacing, "large" loosens it. */
  fontSizeScale: "compact" | "normal" | "large";
  /** Print/display font for headings (month labels, show title). */
  fontHeading: string;
  /** Print/display font for times specifically. */
  fontTime: string;
  /** Print/display font for notes. */
  fontNotes: string;
  /** Per-element font size overrides. "xs" | "sm" | "md" | "lg" | "xl". Default is "md". */
  sizeEventType: "xs" | "sm" | "md" | "lg" | "xl";
  sizeTime: "xs" | "sm" | "md" | "lg" | "xl";
  sizeDescription: "xs" | "sm" | "md" | "lg" | "xl";
  sizeCastBadge: "xs" | "sm" | "md" | "lg" | "xl";
  sizeGroupBadge: "xs" | "sm" | "md" | "lg" | "xl";
  sizeNotes: "xs" | "sm" | "md" | "lg" | "xl";
  sizeLocation: "xs" | "sm" | "md" | "lg" | "xl";
  sizeConflicts: "xs" | "sm" | "md" | "lg" | "xl";
  /** Color scheme. "light" is default, "dark" is for directors who
   *  don't want to stare at a white screen during rehearsal. */
  /** Show cast member conflicts on the calendar grid. */
  showCastConflicts: boolean;
  /** Show production team conflicts on the calendar grid. */
  showCrewConflicts: boolean;
  /** Show event type badges on the calendar grid. */
  showEventTypes: boolean;
  /** Show location labels on the calendar grid. */
  showLocations: boolean;
  theme: "light" | "dark";
  /**
   * ISO dates explicitly assigned an event type via the Defaults mini-
   * calendar picker. Separate from `ScheduleDay.eventTypeId` because we
   * need to distinguish "user assigned this day from the Defaults flow"
   * (clear should preserve the badge, picker should show it) from "user
   * typed into this day in the editor and happened to pick a pill"
   * (clear should delete the day, picker should not list it).
   *
   * Ownership transfers back to the editor flow as soon as the user
   * changes the type via the day editor's pill row.
   */
  defaultsAssignedDates: string[];
  /**
   * How group drops behave:
   * - "group": drops the group as a single chip (default)
   * - "expand": expands the group into individual actor chips
   */
  groupDropMode?: "group" | "expand";
  /** Show location shapes next to call times and in location footers. */
  showLocationShapes?: boolean;
  /** Show US federal holidays as amber badges on the calendar. */
  showUsHolidays?: boolean;
  /** Show holiday badges on the calendar grid. */
  showHolidays?: boolean;
  /** User-defined custom holidays. */
  customHolidays?: Array<{ date: string; name: string }>;
  /** Holiday names that have been individually hidden. */
  hiddenHolidays?: string[];
  /**
   * Deadline (inclusive) for actors to add or edit conflicts via the
   * actor-facing conflict submission page. If unset, actors can edit
   * forever. If set to an ISO date, actors can submit/edit through the
   * end of that day (local time). Starting midnight of the next day,
   * the actor-facing page enters read-only mode showing their previously
   * submitted conflicts without the ability to modify them.
   */
  conflictLockoutDate?: string;
  /**
   * Custom label for the built-in "All Called" sidebar chip. Defaults
   * to "All Called" when unset. Editable via the pencil button on the
   * chip itself.
   */
  allCalledLabel?: string;
  /**
   * Custom color for the "All Called" chip background. Defaults to
   * "#5b1a2b" when unset.
   */
  allCalledColor?: string;
  /**
   * Whether the "All Called" chip is visible in the sidebar. Defaults
   * to true. Set to false via the chip's delete (×) button. Once
   * hidden, the user has to create their own group to restore the
   * "everyone is called" workflow.
   */
  allCalledVisible?: boolean;
  /**
   * Show text labels next to each icon in the top toolbar. Defaults
   * to false (icons only). When true, each button shows its label
   * inline so infrequent users can identify buttons without hovering.
   * Takes up more horizontal space - the toolbar will wrap to multiple
   * rows on narrow screens.
   */
  showToolbarLabels?: boolean;
  /**
   * Hide days with no calls, description, or notes from the list
   * view. Defaults to false (blank days shown) so the list mirrors
   * the calendar grid. Toggle on to get a compact "only days with
   * content" list.
   */
  hideBlankListDays?: boolean;
}

// ------------------------------------------------------------------
// Location presets
// ------------------------------------------------------------------

export interface LocationPreset {
  name: string;
  /** Custom color override. If not set, auto-hashed from name. */
  color?: string;
  /** Custom shape override. If not set, auto-hashed from name. */
  shape?: string;
}

// ------------------------------------------------------------------
// Root document (one per show)
// ------------------------------------------------------------------

export interface ScheduleDoc {
  version: typeof DOCUMENT_VERSION;
  show: Show;
  cast: CastMember[];
  crew: CrewMember[];
  groups: Group[];
  eventTypes: EventType[];
  /** Keyed by ISO date "YYYY-MM-DD". */
  schedule: Record<string, ScheduleDay>;
  conflicts: Conflict[];
  /** Simple string list (legacy). Use locationPresetsV2 for full config. */
  locationPresets: string[];
  /** Rich location presets with custom color and shape. */
  locationPresetsV2?: LocationPreset[];
  settings: Settings;
}
