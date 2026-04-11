<script lang="ts">
  /**
   * One calendar day cell. Renders badge, then one line per call (time,
   * effective description, effective location) with that call's called
   * cast as chips. Out-of-range days (inRange false) render as visual
   * placeholders that still occupy a grid slot so the 7-wide layout holds
   * - critical for print alignment (TLT lesson).
   */
  import type {
    CalendarCell,
    Call,
    CastMember,
    Conflict,
    EventType,
    Group,
    ScheduleDay,
    ScheduleDoc,
  } from "@rehearsal-block/core";
  import {
    blockingConflictsFor,
    castDisplayNames,
    crewFirstNameLabels,
    effectiveDescription,
    effectiveLocation,
    expandCalledActorIds,
    formatTime,
    locationColor,
    locationShape,
    effectiveLocationColor,
    effectiveLocationShape,
    overlappingCallsByActor,
  } from "@rehearsal-block/core";
  import CastChip from "./CastChip.svelte";
  import GroupChip from "./GroupChip.svelte";
  import InlineEditor from "./InlineEditor.svelte";

  type InlineField = "description" | "time" | "endTime" | "notes";

  interface InlineEditState {
    date: string;
    callId?: string;
    field: InlineField;
  }

  interface Props {
    cell: CalendarCell;
    day: ScheduleDay | undefined;
    show: ScheduleDoc;
    selected: boolean;
    onselect: (date: string, shiftKey?: boolean, ctrlKey?: boolean) => void;
    rangeSelected?: boolean;
    onremoveactor?: (date: string, callId: string, actorId: string) => void;
    onremovecrew?: (date: string, callId: string, crewId: string) => void;
    onremovegroup?: (date: string, callId: string, groupId: string) => void;
    onremoveallcalled?: (date: string, callId: string) => void;
    ondropactor?: (date: string, actorId: string, callId?: string) => void;
    ondropcrew?: (date: string, crewId: string, callId?: string) => void;
    ondropgroup?: (date: string, groupId: string, callId?: string) => void;
    ondropallcalled?: (date: string, callId?: string) => void;
    ondropeventtype?: (date: string, typeId: string) => void;
    ondroplocation?: (date: string, locName: string, callId?: string) => void;
    ondropcall?: (date: string) => void;
    ondropnote?: (date: string) => void;
    /** Move an actor/crew/group/allCalled from one call to another
     *  within the same day. Wired by dragging an in-cell chip onto a
     *  different call block and dropping. The demo handler removes
     *  from source + adds to target in one undo step. */
    onmoveactor?: (date: string, sourceCallId: string, targetCallId: string, actorId: string) => void;
    onmovecrew?: (date: string, sourceCallId: string, targetCallId: string, crewId: string) => void;
    onmovegroup?: (date: string, sourceCallId: string, targetCallId: string, groupId: string) => void;
    onmoveallcalled?: (date: string, sourceCallId: string, targetCallId: string) => void;
    /** Hover-to-show ✕ on event type badges removes that type from
     *  the day. Removing the primary promotes the first secondary. */
    onremoveeventtype?: (date: string, typeId: string) => void;
    /** ✕ on a call block removes that call from the day. */
    onremovecall?: (date: string, callId: string) => void;
    /** ✕ on the notes line clears `day.notes`. */
    onremovenotes?: (date: string) => void;
    /** ✕ on a location pill removes that location everywhere on the
     *  day: clears `day.location` if matched, removes from
     *  `extraLocations`, and clears any `call.location` matches. */
    onremovedaylocation?: (date: string, locName: string) => void;
    inlineEdit?: InlineEditState | null;
    onstartinlineedit?: (date: string, field: InlineField, callId?: string) => void;
    oninlinechange?: (patch: Partial<ScheduleDay>) => void;
    oninlinecallchange?: (callId: string, patch: Partial<Call>) => void;
    oncommitinline?: () => void;
    oncancelinline?: () => void;
    /** Map of ISO date to holiday name, computed by parent. */
    holidayNames?: Map<string, string>;
  }

  const {
    cell,
    day,
    show,
    selected,
    onselect,
    rangeSelected = false,
    onremoveactor,
    onremovecrew,
    onremovegroup,
    onremoveallcalled,
    ondropactor,
    ondropcrew,
    ondropgroup,
    ondropallcalled,
    ondropeventtype,
    ondroplocation,
    ondropcall,
    ondropnote,
    onmoveactor,
    onmovecrew,
    onmovegroup,
    onmoveallcalled,
    onremoveeventtype,
    onremovecall,
    onremovenotes,
    onremovedaylocation,
    inlineEdit = null,
    onstartinlineedit,
    oninlinechange,
    oninlinecallchange,
    oncommitinline,
    oncancelinline,
    holidayNames,
  }: Props = $props();

  function isInlineEditing(field: InlineField, callId?: string): boolean {
    if (!inlineEdit) return false;
    if (inlineEdit.field !== field) return false;
    // Exact match on callId
    if (callId && inlineEdit.callId === callId) return true;
    // Day-level edit (no callId in inlineEdit): match the no-callId case
    // or the first populated call (when a blank cell promotes to have calls)
    if (!inlineEdit.callId) {
      if (!callId) return true;
      if (callId === populatedCalls[0]?.id) return true;
    }
    return false;
  }

  /**
   * Handle double-click on the cell. Use composedPath to determine what
   * element was targeted - the Svelte 5 rerender from the first click
   * may have replaced the original element by the time dblclick fires.
   */
  function handleCellDblClick(e: MouseEvent) {
    // Cancel the pending single-click so the editor panel doesn't open
    // and shift the grid layout mid-double-click.
    if (clickTimer) { clearTimeout(clickTimer); clickTimer = null; }
    if (!cell.inRange || !onstartinlineedit) return;
    const path = (e.composedPath?.() ?? [e.target]) as EventTarget[];
    for (const node of path) {
      if (!(node instanceof Element)) continue;
      // Find the call-block ancestor to get the callId (regular or dress/perf)
      const callBlock = node.closest?.(".call-block") ?? node.closest?.(".dp-cell-call");
      const callId = callBlock ? findCallIdFromBlock(callBlock) : undefined;

      // Curtain time (dress/perf)
      if (node.classList?.contains("curtain-time")) {
        onstartinlineedit(cell.date, "time", undefined);
        return;
      }
      if (node.classList?.contains("time") || node.classList?.contains("dp-cell-time")) {
        onstartinlineedit(cell.date, "time", callId);
        return;
      }
      if (node.classList?.contains("dp-cell-suffix")) {
        dpLabelPart = "suffix";
        onstartinlineedit(cell.date, "description", callId);
        return;
      }
      if (node.classList?.contains("call-desc") || node.classList?.contains("description") || node.classList?.contains("dp-cell-label")) {
        dpLabelPart = "label";
        onstartinlineedit(cell.date, "description", callId);
        return;
      }
      if (node.classList?.contains("notes-line") || node.classList?.contains("notes-text")) {
        onstartinlineedit(cell.date, "notes");
        return;
      }
      // Stop at the cell boundary
      if (node.classList?.contains("cell")) break;
    }
    // Double-click on empty area of the cell - edit day description.
    // Works for blank cells too (startInlineEdit creates a draft).
    const firstCall = populatedCalls[0];
    onstartinlineedit(cell.date, "description", firstCall?.id);
  }

  function findCallIdFromBlock(el: Element): string | undefined {
    const parent = el.parentElement;
    if (!parent) return undefined;
    // Regular call blocks or dress/perf call blocks
    const selector = el.classList.contains("dp-cell-call") ? ":scope > .dp-cell-call" : ":scope > .call-block";
    const blocks = parent.querySelectorAll(selector);
    for (let i = 0; i < blocks.length; i++) {
      if (blocks[i] === el) {
        return populatedCalls[i]?.id;
      }
    }
    return undefined;
  }

  const locPresets = $derived(show.locationPresetsV2);

  // Wrappers that pass presets automatically
  function locColor(name: string): string | null {
    return effectiveLocationColor(name, locPresets);
  }
  function locShape(name: string): string {
    return effectiveLocationShape(name, locPresets);
  }

  const eventType = $derived<EventType | undefined>(
    day ? show.eventTypes.find((t) => t.id === day.eventTypeId) : undefined,
  );

  /** Whether this date was assigned via the Defaults mini-calendar picker. */
  const isDefaultsAssigned = $derived(
    show.settings.defaultsAssignedDates?.includes(cell.date) ?? false,
  );

  /**
   * For defaults-assigned dates, hide the event type badge until the user
   * adds real content (actors, crew, groups, description, notes). This
   * prevents bare "pre-tagged" cells from cluttering the grid.
   * Non-defaults dates always show the badge.
   */
  const showEventBadge = $derived.by(() => {
    if (!day) return false;
    if (!isDefaultsAssigned) return true;
    if (day.calls?.some(c => c.calledActorIds.length > 0 || c.calledCrewIds?.length || c.calledGroupIds?.length || c.allCalled || c.label)) return true;
    if (day.description) return true;
    if (day.notes) return true;
    return false;
  });

  /** Current cast display mode, applied to every chip in the cell. */
  const displayMode = $derived(show.settings.castDisplayMode ?? "actor");
  const crewDisplayMode = $derived(show.settings.crewDisplayMode ?? "both");

  /** Customized All Called label + color from settings, with defaults. */
  const allCalledLabel = $derived(
    show.settings.allCalledLabel?.trim() || "All Called",
  );
  const allCalledColor = $derived(
    show.settings.allCalledColor || "#5b1a2b",
  );

  /**
   * Disambiguated display names for every cast member. Computed once
   * per day cell render and looked up per chip; the map respects the
   * current display mode so the grid shows actor, character, or both
   * labels consistently. Cross-pool aware: first-name collisions with
   * crew members trigger last-initial disambiguation on the cast side.
   */
  const displayNames = $derived(castDisplayNames(show.cast, displayMode, show.crew));

  /**
   * Disambiguated first-name labels for crew members. Cross-pool aware
   * with cast so "Marcus Chen" (cast) and "Marcus Webb" (crew) both
   * render as "Marcus C." / "Marcus W.".
   */
  const crewLabels = $derived(crewFirstNameLabels(show.cast, show.crew));

  function crewChipLabel(cm: { id: string; firstName: string; lastName: string; role: string }): string {
    const name = crewLabels.get(cm.id) ?? cm.firstName;
    // "role" mode shows the role (with name fallback when role is empty).
    // "name" and "both" BOTH show just the disambiguated name in cells to
    // keep chips compact - the sidebar still renders role alongside name
    // in "both" mode, but cells save space by hiding it. Matches the cast
    // chip behavior in "both" mode, which also only shows the name in cells.
    if (crewDisplayMode === "role") return cm.role || name;
    return name;
  }

  const timeFmt = $derived(show.settings.timeFormat ?? "12h");

  function fmtTime(hhmm: string): string {
    return formatTime(hhmm, timeFmt);
  }

  function timeRange(call: Call): string {
    const start = fmtTime(call.time);
    if (!start || start === "-") return "";
    if (call.endTime) return `${start} – ${fmtTime(call.endTime)}`;
    return `${start}+`;
  }

  /** Conflicts registered on the document for this specific date. */
  const dayConflicts = $derived<Conflict[]>(
    show.conflicts.filter((c) => c.date === cell.date),
  );

  /**
   * Resolve the "direct" cast chips to render for a call: actors
   * explicitly added via `calledActorIds` AND not already covered by a
   * group that's also called on this call. Conflicts are filtered out
   * so blocked actors don't appear.
   */
  function directMembers(call: Call): CastMember[] {
    if (call.allCalled) return [];
    const coveredByGroup = new Set<string>();
    for (const gid of call.calledGroupIds) {
      const g = show.groups.find((x) => x.id === gid);
      if (g) for (const mid of g.memberIds) coveredByGroup.add(mid);
    }
    return show.cast.filter(
      (m) =>
        call.calledActorIds.includes(m.id) &&
        !coveredByGroup.has(m.id) &&
        blockingConflictsFor(m.id, call, dayConflicts).length === 0,
    );
  }

  /** Crew members called on this call. */
  function calledCrew(call: Call): { id: string; firstName: string; lastName: string; role: string; color: string }[] {
    const ids = call.calledCrewIds ?? [];
    if (ids.length === 0) return [];
    return show.crew
      .filter((m) => ids.includes(m.id))
      .map((m) => ({ id: m.id, firstName: m.firstName, lastName: m.lastName, role: m.role, color: m.color }));
  }

  /** Groups called on this call, in calledGroupIds order. */
  function callGroups(call: Call): Group[] {
    if (call.allCalled) return [];
    return call.calledGroupIds
      .map((gid) => show.groups.find((g) => g.id === gid))
      .filter((g): g is Group => !!g);
  }

  /** People with at least one conflict today, filtered by visibility settings. */
  const conflictedMembers = $derived.by<CastMember[]>(() => {
    if (dayConflicts.length === 0) return [];
    const showCast = show.settings.showCastConflicts ?? true;
    const showCrew = show.settings.showCrewConflicts ?? false;
    const castIds = new Set(show.cast.map((m) => m.id));
    const crewIds = new Set(show.crew.map((m) => m.id));
    const visibleIds = new Set(
      dayConflicts
        .filter((c) => (showCast && castIds.has(c.actorId)) || (showCrew && crewIds.has(c.actorId)))
        .map((c) => c.actorId),
    );
    if (visibleIds.size === 0) return [];
    // Return cast members + crew-as-cast for display
    const result: CastMember[] = [];
    if (showCast) result.push(...show.cast.filter((m) => visibleIds.has(m.id)));
    if (showCrew) result.push(...show.crew.filter((m) => visibleIds.has(m.id)).map((m) => ({ ...m, character: m.role })));
    return result;
  });

  /**
   * A call is "populated" (worth rendering in the grid) only once the
   * director has added real content: a called actor, a called group, a
   * per-call description, or a day-level description (which is inherited
   * by every call). Bulk-assigning an event type via the Defaults mini-
   * calendar seeds a skeleton call with weekday-default times, but the
   * grid stays quiet - only the badge shows - until the director adds
   * something meaningful, matching the "don't clutter the grid with
   * default values" expectation.
   */
  const isDressPerf = $derived(eventType?.isDressPerf ?? false);

  /** Tracks which part of a dress/perf label was clicked: "label" or "suffix". */
  let dpLabelPart = $state<"label" | "suffix">("label");

  function isCallPopulated(call: Call): boolean {
    // Dress/perf calls are "populated" as soon as they have a time set -
    // the label + time is all they need to render in the grid.
    if (isDressPerf) return call.time !== "";
    // User-dropped Call chips render even when empty so the drop has
    // immediate visual feedback.
    if (call.manuallyAdded) return true;
    if (call.allCalled) return true;
    if (call.calledActorIds.length > 0) return true;
    if ((call.calledCrewIds ?? []).length > 0) return true;
    if (call.calledGroupIds.length > 0) return true;
    if ((call.description ?? "").trim() !== "") return true;
    if ((day?.description ?? "").trim() !== "") return true;
    return false;
  }

  /** Calls that should actually render in the grid cell. */
  const populatedCalls = $derived.by<Call[]>(() => {
    if (!day) return [];
    return day.calls.filter(isCallPopulated);
  });

  /**
   * Plain-text version of the day's notes, used for the hover `title`
   * attribute and the empty-check (so a `<p></p>` shell counts as empty).
   * The visible grid rendering uses `{@html day.notes}` directly so the
   * director's bold/italic formatting from the rich-text editor carries
   * through - block spacing is tightened via the scoped `.notes-text`
   * CSS rules so paragraphs don't add stray line breaks inside the cell.
   */
  const notesPlain = $derived<string>(
    day?.notes
      ? day.notes
          .replace(/<[^>]*>/g, " ")
          .replace(/\s+/g, " ")
          .trim()
      : "",
  );

  /**
   * Unique list of effective locations across the POPULATED calls,
   * preserving first-seen order so the footer reads top-to-bottom in the
   * same order the calls appear above it. Empty/skeleton calls (from
   * bulk-assigned event types) don't contribute - their locations stay
   * hidden until the director adds real content.
   */
  /**
   * Cast members who appear in two or more calls on this day with
   * overlapping times. Drives the small amber warning indicator. Drag
   * & drop into the grid doesn't block double-bookings (the day editor
   * has a fuller warning UI), so this surface lets the director know
   * to investigate without opening the editor.
   */
  const doubleBookedNames = $derived.by<string[]>(() => {
    if (!day || day.calls.length < 2) return [];
    const overlaps = overlappingCallsByActor(day, show.groups, show.cast);
    if (overlaps.size === 0) return [];
    const out: string[] = [];
    for (const actorId of overlaps.keys()) {
      const member = show.cast.find((m) => m.id === actorId);
      if (member) out.push(displayNames.get(member.id) ?? member.firstName);
    }
    return out;
  });

  const uniqueLocations = $derived.by<string[]>(() => {
    if (!day) return [];
    const seen = new Set<string>();
    const out: string[] = [];
    // 1. Locations from populated calls (effectiveLocation includes the
    //    day-level fallback, so any call without an explicit override
    //    contributes day.location here).
    for (const call of populatedCalls) {
      const loc = effectiveLocation(day, call).trim();
      if (loc && !seen.has(loc)) {
        seen.add(loc);
        out.push(loc);
      }
    }
    // 2. day.location, in case there were no populated calls to surface
    //    it (blank cells, dress/perf pre-populate, etc).
    const dayLoc = (day.location ?? "").trim();
    if (dayLoc && !seen.has(dayLoc)) {
      seen.add(dayLoc);
      out.push(dayLoc);
    }
    // 3. Day-level extras (additional locations dragged onto the cell
    //    after the primary was set, NOT yet bound to a call). These
    //    appear in the footer without coloring any existing call.
    for (const loc of day.extraLocations ?? []) {
      const trimmed = loc.trim();
      if (trimmed && !seen.has(trimmed)) {
        seen.add(trimmed);
        out.push(trimmed);
      }
    }
    return out;
  });

  // Delay single-click so a double-click can cancel it. Without this,
  // the first click opens the DayEditor panel which shifts the grid
  // layout, causing the second click of a double-click to miss.
  let clickTimer: ReturnType<typeof setTimeout> | null = null;

  function handleClick(e: MouseEvent) {
    if (!cell.inRange) return;
    const shift = e.shiftKey;
    const ctrl = e.ctrlKey || e.metaKey;
    if (clickTimer) clearTimeout(clickTimer);
    clickTimer = setTimeout(() => {
      clickTimer = null;
      onselect(cell.date, shift, ctrl);
    }, 250);
  }

  function handleKey(e: KeyboardEvent) {
    if (!cell.inRange) return;
    // Only handle Enter / Space as a cell-activation when the focus is
    // on the cell button itself. If a child input (e.g. an inline
    // description editor) is focused, the keydown bubbles up here and
    // we MUST let it through, otherwise typing a space in the editor
    // gets swallowed by preventDefault.
    if (e.target !== e.currentTarget) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onselect(cell.date);
    }
  }

  // Drag-and-drop target state.
  // Cell-level state: used when the day is blank / has no populated calls.
  let cellDragHot = $state(0);
  const cellIsDragHot = $derived(cellDragHot > 0);

  // Per-call-block state: keyed by call id. Each call block is its own
  // drop zone so the user can aim at the specific time block they want.
  let callDragHot = $state<Record<string, number>>({});
  function isCallDragHot(callId: string) {
    return (callDragHot[callId] ?? 0) > 0;
  }

  function hasDragPayload(e: DragEvent): boolean {
    const types = e.dataTransfer?.types;
    if (!types) return false;
    return (
      types.includes("text/rb-actor") ||
      types.includes("text/rb-crew") ||
      types.includes("text/rb-group") ||
      types.includes("text/rb-all-called") ||
      types.includes("text/rb-event-type") ||
      types.includes("text/rb-location") ||
      types.includes("text/rb-call") ||
      types.includes("text/rb-note") ||
      types.includes("text/rb-move-actor") ||
      types.includes("text/rb-move-crew") ||
      types.includes("text/rb-move-group") ||
      types.includes("text/rb-move-all-called")
    );
  }

  // --- Move dragstart helpers -----------------------------------------
  // When a chip inside a cell is dragged, we record the source call id
  // alongside the actor/crew/group id so the drop target knows where
  // to remove from. Payload is "sourceCallId|id" (pipe-delimited to
  // dodge the colons that sometimes appear in ids).
  function dragMoveActor(e: DragEvent, sourceCallId: string, actorId: string) {
    if (!e.dataTransfer) return;
    e.dataTransfer.setData("text/rb-move-actor", `${sourceCallId}|${actorId}`);
    // "copyMove" so the drop target's dropEffect = "copy" is still
    // compatible with our move source - otherwise the browser refuses
    // the drop with incompatible effects.
    e.dataTransfer.effectAllowed = "copyMove";
  }
  function dragMoveCrew(e: DragEvent, sourceCallId: string, crewId: string) {
    if (!e.dataTransfer) return;
    e.dataTransfer.setData("text/rb-move-crew", `${sourceCallId}|${crewId}`);
    // "copyMove" so the drop target's dropEffect = "copy" is still
    // compatible with our move source - otherwise the browser refuses
    // the drop with incompatible effects.
    e.dataTransfer.effectAllowed = "copyMove";
  }
  function dragMoveGroup(e: DragEvent, sourceCallId: string, groupId: string) {
    if (!e.dataTransfer) return;
    e.dataTransfer.setData("text/rb-move-group", `${sourceCallId}|${groupId}`);
    // "copyMove" so the drop target's dropEffect = "copy" is still
    // compatible with our move source - otherwise the browser refuses
    // the drop with incompatible effects.
    e.dataTransfer.effectAllowed = "copyMove";
  }
  function dragMoveAllCalled(e: DragEvent, sourceCallId: string) {
    if (!e.dataTransfer) return;
    e.dataTransfer.setData("text/rb-move-all-called", sourceCallId);
    // "copyMove" so the drop target's dropEffect = "copy" is still
    // compatible with our move source - otherwise the browser refuses
    // the drop with incompatible effects.
    e.dataTransfer.effectAllowed = "copyMove";
  }

  // Shake animation state for rejected drops.
  let shaking = $state(false);

  function triggerShake() {
    shaking = true;
    setTimeout(() => (shaking = false), 500);
  }

  /**
   * Check if an actor has any conflict on this day. Uses the full-day
   * conflict check (not per-call) since we're deciding at the cell level
   * whether to accept the drop at all.
   */
  function actorHasConflict(actorId: string): boolean {
    return dayConflicts.some((c) => c.actorId === actorId);
  }

  function dispatchDrop(dt: DataTransfer, callId?: string) {
    // Move types first: reparenting an in-cell chip to another call
    // on the same day. Only fires when the drop lands on a specific
    // call block (`callId` present) that's different from the source.
    // Cell-level drops of move types are ignored.
    const moveActorPayload = dt.getData("text/rb-move-actor");
    if (moveActorPayload) {
      const [sourceCallId, actorId] = moveActorPayload.split("|");
      if (callId && sourceCallId && actorId && callId !== sourceCallId) {
        onmoveactor?.(cell.date, sourceCallId, callId, actorId);
      }
      return;
    }
    const moveCrewPayload = dt.getData("text/rb-move-crew");
    if (moveCrewPayload) {
      const [sourceCallId, crewId] = moveCrewPayload.split("|");
      if (callId && sourceCallId && crewId && callId !== sourceCallId) {
        onmovecrew?.(cell.date, sourceCallId, callId, crewId);
      }
      return;
    }
    const moveGroupPayload = dt.getData("text/rb-move-group");
    if (moveGroupPayload) {
      const [sourceCallId, groupId] = moveGroupPayload.split("|");
      if (callId && sourceCallId && groupId && callId !== sourceCallId) {
        onmovegroup?.(cell.date, sourceCallId, callId, groupId);
      }
      return;
    }
    const moveAllCalledSource = dt.getData("text/rb-move-all-called");
    if (moveAllCalledSource) {
      if (callId && callId !== moveAllCalledSource) {
        onmoveallcalled?.(cell.date, moveAllCalledSource, callId);
      }
      return;
    }
    const actorId = dt.getData("text/rb-actor");
    if (actorId) {
      if (actorHasConflict(actorId)) {
        triggerShake();
        return;
      }
      ondropactor?.(cell.date, actorId, callId);
      return;
    }
    const crewId = dt.getData("text/rb-crew");
    if (crewId) {
      ondropcrew?.(cell.date, crewId, callId);
      return;
    }
    const groupId = dt.getData("text/rb-group");
    if (groupId) {
      ondropgroup?.(cell.date, groupId, callId);
      return;
    }
    if (dt.getData("text/rb-all-called") === "1") {
      ondropallcalled?.(cell.date, callId);
      return;
    }
    const eventTypeId = dt.getData("text/rb-event-type");
    if (eventTypeId) {
      ondropeventtype?.(cell.date, eventTypeId);
      return;
    }
    const locName = dt.getData("text/rb-location");
    if (locName) {
      ondroplocation?.(cell.date, locName, callId);
      return;
    }
    if (dt.getData("text/rb-call") === "1") {
      ondropcall?.(cell.date);
      return;
    }
    if (dt.getData("text/rb-note") === "1") {
      ondropnote?.(cell.date);
      return;
    }
  }

  // --- Cell-level handlers (fallback for blank / zero-call days) ---

  function handleCellDragEnter(e: DragEvent) {
    if (!cell.inRange || !hasDragPayload(e)) return;
    e.preventDefault();
    cellDragHot++;
  }

  function handleCellDragOver(e: DragEvent) {
    if (!cell.inRange || !hasDragPayload(e)) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
  }

  function handleCellDragLeave() {
    if (cellDragHot > 0) cellDragHot--;
  }

  function handleCellDrop(e: DragEvent) {
    if (!cell.inRange) return;
    e.preventDefault();
    cellDragHot = 0;
    if (!e.dataTransfer) return;
    dispatchDrop(e.dataTransfer);
  }

  // --- Per-call-block handlers ---

  function handleCallDragEnter(e: DragEvent, callId: string) {
    if (!hasDragPayload(e)) return;
    e.preventDefault();
    e.stopPropagation(); // don't bubble to cell
    callDragHot = { ...callDragHot, [callId]: (callDragHot[callId] ?? 0) + 1 };
  }

  function handleCallDragOver(e: DragEvent) {
    if (!hasDragPayload(e)) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
  }

  function handleCallDragLeave(callId: string) {
    const prev = callDragHot[callId] ?? 0;
    if (prev > 0) {
      callDragHot = { ...callDragHot, [callId]: prev - 1 };
    }
  }

  function handleCallDrop(e: DragEvent, callId: string) {
    e.preventDefault();
    e.stopPropagation();
    callDragHot = { ...callDragHot, [callId]: 0 };
    if (!e.dataTransfer) return;
    dispatchDrop(e.dataTransfer, callId);
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div
  class="cell"
  class:placeholder={!cell.inRange}
  class:selected
  class:range-selected={rangeSelected}
  class:today={cell.isToday}
  class:drag-hot={cellIsDragHot}
  class:shake={shaking}
  role={cell.inRange ? "button" : "presentation"}
  tabindex={cell.inRange ? 0 : undefined}
  onclick={handleClick}
  ondblclick={handleCellDblClick}
  onkeydown={handleKey}
  ondragenter={handleCellDragEnter}
  ondragover={handleCellDragOver}
  ondragleave={handleCellDragLeave}
  ondrop={handleCellDrop}
  aria-label={cell.inRange ? `Edit ${cell.date}` : undefined}
  aria-hidden={cell.inRange ? undefined : "true"}
>
  <div class="cell-header">
    <span class="day-number">{cell.dayOfMonth}{#if cell.dayOfMonth === 1 || cell.date === show.show.startDate} <span class="day-month">{["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"][cell.month]}</span>{/if}</span>
    <div class="badge-group">
      {#if eventType && (show.settings.showEventTypes ?? true) && showEventBadge}
        <span
          class="badge badge-primary"
          class:removable={!!onremoveeventtype}
          style:background={eventType.bgColor}
          style:color={eventType.textColor}
        >
          {eventType.name}
          {#if onremoveeventtype}
            <button
              type="button"
              class="badge-remove"
              aria-label={`Remove ${eventType.name}`}
              title={`Remove ${eventType.name}`}
              onclick={(e) => { e.stopPropagation(); onremoveeventtype?.(cell.date, eventType.id); }}
            >
              ×
            </button>
          {/if}
        </span>
      {/if}
      {#if day?.secondaryTypeIds && (show.settings.showEventTypes ?? true)}
        {#each day.secondaryTypeIds as secId (secId)}
          {@const secType = show.eventTypes.find((t) => t.id === secId)}
          {#if secType}
            <span
              class="badge"
              class:removable={!!onremoveeventtype}
              style:background={secType.bgColor}
              style:color={secType.textColor}
            >
              {secType.name}
              {#if onremoveeventtype}
                <button
                  type="button"
                  class="badge-remove"
                  aria-label={`Remove ${secType.name}`}
                  title={`Remove ${secType.name}`}
                  onclick={(e) => { e.stopPropagation(); onremoveeventtype?.(cell.date, secType.id); }}
                >
                  ×
                </button>
              {/if}
            </span>
          {/if}
        {/each}
      {/if}
    </div>
  </div>
  {#if (show.settings.showHolidays ?? true) && holidayNames?.get(cell.date)}
    <span class="holiday-badge">{holidayNames.get(cell.date)}</span>
  {/if}

  {#if cell.inRange && eventType?.isDressPerf}
    {#if isInlineEditing("time") && !inlineEdit?.callId}
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="curtain-time" onclick={(e) => e.stopPropagation()} ondblclick={(e) => e.stopPropagation()}>
        <InlineEditor
          field="time"
          value={day?.curtainTime ?? ""}
          {show}
          onchange={(v) => oninlinechange?.({ curtainTime: v })}
          oncommit={() => oncommitinline?.()}
          oncancel={() => oncancelinline?.()}
        />
        <span class="curtain-label">CURTAIN</span>
      </div>
    {:else if day?.curtainTime}
      <div class="curtain-time" style:color={eventType.textColor}>
        {fmtTime(day.curtainTime)} <span class="curtain-label">CURTAIN</span>
      </div>
    {/if}
  {/if}

  {#if cell.inRange}
    {#if day}
      {#if populatedCalls.length === 0}
        <!-- No populated calls: day may still show a day-level description
             (content) and/or notes. Times + locations stay hidden until the
             director adds actors / descriptions to individual calls. -->
        {#if isInlineEditing("description")}
          <InlineEditor
            field="description"
            value={day.description}
            {show}
            onchange={(v) => oninlinechange?.({ description: v })}
            oncommit={() => oncommitinline?.()}
            oncancel={() => oncancelinline?.()}
            onnextfield={() => onstartinlineedit?.(cell.date, "notes")}
          />
        {:else if day.description}
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div class="description">{day.description}</div>
        {/if}
        {#if isInlineEditing("notes") && !populatedCalls.length}
          <InlineEditor
            field="notes"
            value={day.notes ?? ""}
            {show}
            onchange={(v) => oninlinechange?.({ notes: v })}
            oncommit={() => oncommitinline?.()}
            oncancel={() => oncancelinline?.()}
          />
        {:else if notesPlain}
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div class="notes-line" class:removable={!!onremovenotes} title={notesPlain}>
            <span class="notes-text">{@html day.notes}</span>
            {#if onremovenotes}
              <button
                type="button"
                class="notes-remove"
                aria-label="Remove notes"
                title="Remove notes"
                onclick={(e) => { e.stopPropagation(); onremovenotes?.(cell.date); }}
              >
                ×
              </button>
            {/if}
          </div>
        {/if}
        {#if uniqueLocations.length > 0 && (show.settings.showLocations ?? true)}
          <div class="location-footer">
            {#each uniqueLocations as loc (loc)}
              {@const color = locColor(loc)}
              <span
                class="loc-pill"
                class:removable={!!onremovedaylocation}
                style:--loc-color={color ?? "var(--color-text-muted)"}
              >
                <span class="loc-shape">{locShape(loc)}</span>{loc}
                {#if onremovedaylocation}
                  <button
                    type="button"
                    class="loc-remove"
                    aria-label={`Remove ${loc}`}
                    title={`Remove ${loc}`}
                    onclick={(e) => { e.stopPropagation(); onremovedaylocation?.(cell.date, loc); }}
                  >
                    ×
                  </button>
                {/if}
              </span>
            {/each}
          </div>
        {/if}
      {:else if isDressPerf}
        <!-- Dress/perf: show labeled call times with optional group/actor
             chips for multi-cast shows. -->
        {#each populatedCalls as call (call.id)}
          {@const suffix = call.suffix ?? "Call"}
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div
            class="dp-cell-call"
            class:call-drag-hot={isCallDragHot(call.id)}
            class:removable={!!onremovecall}
            ondragenter={(e) => handleCallDragEnter(e, call.id)}
            ondragover={handleCallDragOver}
            ondragleave={() => handleCallDragLeave(call.id)}
            ondrop={(e) => handleCallDrop(e, call.id)}
          >
            {#if onremovecall}
              <button
                type="button"
                class="call-remove"
                aria-label="Remove call"
                title="Remove call"
                onclick={(e) => { e.stopPropagation(); onremovecall?.(cell.date, call.id); }}
              >
                ×
              </button>
            {/if}
            <div class="dp-cell-header">
              {#if isInlineEditing("description", call.id)}
                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <span class="dp-inline-labels" onclick={(e) => e.stopPropagation()} ondblclick={(e) => e.stopPropagation()}>
                  <InlineEditor
                    field="description"
                    value={call.label ?? ""}
                    {show}
                    active={dpLabelPart === "label"}
                    onchange={(v) => oninlinecallchange?.(call.id, { label: v })}
                    oncommit={() => oncommitinline?.()}
                    oncancel={() => oncancelinline?.()}
                  />
                  <InlineEditor
                    field="description"
                    value={call.suffix ?? "Call"}
                    {show}
                    active={dpLabelPart === "suffix"}
                    onchange={(v) => oninlinecallchange?.(call.id, { suffix: v || "Call" })}
                    oncommit={() => oncommitinline?.()}
                    oncancel={() => oncancelinline?.()}
                  />
                </span>
              {:else}
                <span class="dp-cell-label">{call.label ? call.label : ""}<span class="dp-cell-suffix">{suffix}</span></span>
              {/if}
              {#if isInlineEditing("time", call.id)}
                <InlineEditor
                  field="time"
                  value={call.time}
                  {show}
                  onchange={(v) => oninlinecallchange?.(call.id, { time: v })}
                  oncommit={() => oncommitinline?.()}
                  oncancel={() => oncancelinline?.()}
                />
              {:else}
                <span class="dp-cell-time">{fmtTime(call.time)}</span>
              {/if}
            </div>
          </div>
        {/each}
        {#if isInlineEditing("notes")}
          <InlineEditor
            field="notes"
            value={day.notes ?? ""}
            {show}
            onchange={(v) => oninlinechange?.({ notes: v })}
            oncommit={() => oncommitinline?.()}
            oncancel={() => oncancelinline?.()}
          />
        {:else if notesPlain}
          <div class="notes-line" class:removable={!!onremovenotes} title={notesPlain}>
            <span class="notes-text">{@html day.notes}</span>
            {#if onremovenotes}
              <button
                type="button"
                class="notes-remove"
                aria-label="Remove notes"
                title="Remove notes"
                onclick={(e) => { e.stopPropagation(); onremovenotes?.(cell.date); }}
              >
                ×
              </button>
            {/if}
          </div>
        {/if}
        <!-- Consolidated chips row for dress/perf: groups, actors, and
             All Called from ALL calls on this day, rendered as a single
             block between the call times and the location footer. -->
        {@const allDpGroups = day.calls.flatMap(c => callGroups(c))}
        {@const allDpIndividuals = day.calls.flatMap(c => directMembers(c))}
        {@const anyAllCalled = day.calls.some(c => c.allCalled)}
        {#if anyAllCalled || allDpGroups.length > 0 || allDpIndividuals.length > 0}
          <div class="chips dp-chips-row">
            {#if anyAllCalled}
              <span class="all-called-mini" style:background={allCalledColor}>
                <span class="all-mini-dot" aria-hidden="true"></span>
                {allCalledLabel}
              </span>
            {/if}
            {#each allDpGroups as group (group.id)}
              <GroupChip
                {group}
                compact
                onremove={onremovegroup
                  ? () => {
                      const callWithGroup = day.calls.find(c => c.calledGroupIds.includes(group.id));
                      if (callWithGroup) onremovegroup(cell.date, callWithGroup.id, group.id);
                    }
                  : undefined}
              />
            {/each}
            {#each allDpIndividuals as member (member.id)}
              <CastChip
                {member}
                compact
                mode={displayMode}
                displayName={displayNames.get(member.id)}
                onremove={onremoveactor
                  ? () => {
                      const callWith = day.calls.find(c => c.calledActorIds.includes(member.id));
                      if (callWith) onremoveactor(cell.date, callWith.id, member.id);
                    }
                  : undefined}
              />
            {/each}
          </div>
        {/if}
        {#if uniqueLocations.length > 0 && (show.settings.showLocations ?? true)}
          <div class="location-footer">
            {#each uniqueLocations as loc (loc)}
              {@const color = locColor(loc)}
              <span
                class="loc-pill"
                class:removable={!!onremovedaylocation}
                style:--loc-color={color ?? "var(--color-text-muted)"}
              >
                <span class="loc-shape">{locShape(loc)}</span>{loc}
                {#if onremovedaylocation}
                  <button
                    type="button"
                    class="loc-remove"
                    aria-label={`Remove ${loc}`}
                    title={`Remove ${loc}`}
                    onclick={(e) => { e.stopPropagation(); onremovedaylocation?.(cell.date, loc); }}
                  >
                    ×
                  </button>
                {/if}
              </span>
            {/each}
          </div>
        {/if}
      {:else}
        {#each populatedCalls as call (call.id)}
          {@const desc = effectiveDescription(day, call)}
          {@const loc = effectiveLocation(day, call)}
          {@const color = loc ? locColor(loc) : null}
          {@const groupsForCall = callGroups(call)}
          {@const individuals = directMembers(call)}
          {@const crewMembers = calledCrew(call)}
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div
            class="call-block"
            class:multi={day.calls.length > 1}
            class:call-drag-hot={isCallDragHot(call.id)}
            class:removable={!!onremovecall}
            style:--time-color={color ?? "var(--color-text)"}
            ondragenter={(e) => handleCallDragEnter(e, call.id)}
            ondragover={handleCallDragOver}
            ondragleave={() => handleCallDragLeave(call.id)}
            ondrop={(e) => handleCallDrop(e, call.id)}
          >
            {#if onremovecall}
              <button
                type="button"
                class="call-remove"
                aria-label="Remove call"
                title="Remove call"
                onclick={(e) => { e.stopPropagation(); onremovecall?.(cell.date, call.id); }}
              >
                ×
              </button>
            {/if}
            {#if isInlineEditing("time", call.id) || isInlineEditing("endTime", call.id)}
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <div class="inline-time-row" onclick={(e) => e.stopPropagation()} ondblclick={(e) => e.stopPropagation()}>
                <InlineEditor
                  field="time"
                  value={call.time}
                  {show}
                  active={isInlineEditing("time", call.id)}
                  onchange={(v) => oninlinecallchange?.(call.id, { time: v })}
                  oncommit={() => onstartinlineedit?.(cell.date, "endTime", call.id)}
                  oncancel={() => oncancelinline?.()}
                />
                <span class="inline-time-sep">&ndash;</span>
                <InlineEditor
                  field="endTime"
                  value={call.endTime ?? ""}
                  {show}
                  active={isInlineEditing("endTime", call.id)}
                  minTime={call.time}
                  onchange={(v) => oninlinecallchange?.(call.id, { endTime: v || undefined })}
                  oncommit={() => oncommitinline?.()}
                  oncancel={() => oncancelinline?.()}
                />
              </div>
            {:else if timeRange(call)}
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <div class="time">{#if show.settings.showLocationShapes && loc}<span class="loc-shape" style:color={color}>{locShape(loc)}</span>{/if}{timeRange(call)}</div>
            {/if}
            {#if isInlineEditing("description", call.id)}
              <InlineEditor
                field="description"
                value={desc}
                {show}
                onchange={(v) => {
                  if (inlineEdit?.callId) {
                    oninlinecallchange?.(call.id, { description: v });
                  } else {
                    oninlinechange?.({ description: v });
                  }
                }}
                oncommit={() => oncommitinline?.()}
                oncancel={() => oncancelinline?.()}
                onnextfield={() => onstartinlineedit?.(cell.date, "time", call.id)}
              />
            {:else if desc}
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <div class="call-desc">{desc}</div>
            {:else}
              <div class="call-desc call-desc-empty"></div>
            {/if}
            {#if call.allCalled}
              <div class="chips">
                <span
                  class="all-called-mini"
                  class:grabbable={!!onmoveallcalled}
                  style:background={allCalledColor}
                  draggable={onmoveallcalled ? "true" : undefined}
                  ondragstart={onmoveallcalled ? (e) => dragMoveAllCalled(e, call.id) : undefined}
                >
                  <span class="all-mini-dot" aria-hidden="true"></span>
                  {allCalledLabel}
                  {#if onremoveallcalled}
                    <button
                      type="button"
                      class="mini-x"
                      aria-label="Uncall everyone"
                      onclick={(e) => {
                        e.stopPropagation();
                        onremoveallcalled(cell.date, call.id);
                      }}
                    >
                      ×
                    </button>
                  {/if}
                </span>
                {#each crewMembers as cm (cm.id)}
                  <span
                    class="crew-chip"
                    class:grabbable={!!onmovecrew}
                    style:--crew-color={cm.color}
                    draggable={onmovecrew ? "true" : undefined}
                    ondragstart={onmovecrew ? (e) => dragMoveCrew(e, call.id, cm.id) : undefined}
                  >
                    <span class="crew-chip-square" style:background={cm.color}></span>
                    <span class="crew-chip-name">{crewChipLabel(cm)}</span>
                    <button
                      type="button"
                      class="crew-chip-x"
                      aria-label="Remove {cm.firstName}"
                      onclick={(e) => {
                        e.stopPropagation();
                        onremovecrew?.(cell.date, call.id, cm.id);
                      }}
                    >×</button>
                  </span>
                {/each}
              </div>
            {:else if groupsForCall.length > 0 || individuals.length > 0 || crewMembers.length > 0}
              <div class="chips">
                {#each groupsForCall as group (group.id)}
                  <GroupChip
                    {group}
                    compact
                    draggable={!!onmovegroup}
                    ondragstart={onmovegroup ? (e) => dragMoveGroup(e, call.id, group.id) : undefined}
                    onremove={onremovegroup
                      ? () => onremovegroup(cell.date, call.id, group.id)
                      : undefined}
                  />
                {/each}
                {#each individuals as member (member.id)}
                  <CastChip
                    {member}
                    compact
                    mode={displayMode}
                    displayName={displayNames.get(member.id)}
                    draggable={!!onmoveactor}
                    ondragstart={onmoveactor ? (e) => dragMoveActor(e, call.id, member.id) : undefined}
                    onremove={onremoveactor
                      ? () => onremoveactor(cell.date, call.id, member.id)
                      : undefined}
                  />
                {/each}
                {#each crewMembers as cm (cm.id)}
                  <span
                    class="crew-chip"
                    class:grabbable={!!onmovecrew}
                    style:--crew-color={cm.color}
                    draggable={onmovecrew ? "true" : undefined}
                    ondragstart={onmovecrew ? (e) => dragMoveCrew(e, call.id, cm.id) : undefined}
                  >
                    <span class="crew-chip-square" style:background={cm.color}></span>
                    <span class="crew-chip-name">{crewChipLabel(cm)}</span>
                    <button
                      type="button"
                      class="crew-chip-x"
                      aria-label="Remove {cm.firstName}"
                      onclick={(e) => {
                        e.stopPropagation();
                        onremovecrew?.(cell.date, call.id, cm.id);
                      }}
                    >×</button>
                  </span>
                {/each}
              </div>
            {/if}
          </div>
        {/each}
        {#if isInlineEditing("notes")}
          <InlineEditor
            field="notes"
            value={day.notes ?? ""}
            {show}
            onchange={(v) => oninlinechange?.({ notes: v })}
            oncommit={() => oncommitinline?.()}
            oncancel={() => oncancelinline?.()}
          />
        {:else if notesPlain}
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div class="notes-line" class:removable={!!onremovenotes} title={notesPlain}>
            <span class="notes-text">{@html day.notes}</span>
            {#if onremovenotes}
              <button
                type="button"
                class="notes-remove"
                aria-label="Remove notes"
                title="Remove notes"
                onclick={(e) => { e.stopPropagation(); onremovenotes?.(cell.date); }}
              >
                ×
              </button>
            {/if}
          </div>
        {/if}
        {#if uniqueLocations.length > 0 && (show.settings.showLocations ?? true)}
          <div class="location-footer">
            {#each uniqueLocations as loc (loc)}
              {@const color = locColor(loc)}
              <span
                class="loc-pill"
                class:removable={!!onremovedaylocation}
                style:--loc-color={color ?? "var(--color-text-muted)"}
              >
                <span class="loc-shape">{locShape(loc)}</span>{loc}
                {#if onremovedaylocation}
                  <button
                    type="button"
                    class="loc-remove"
                    aria-label={`Remove ${loc}`}
                    title={`Remove ${loc}`}
                    onclick={(e) => { e.stopPropagation(); onremovedaylocation?.(cell.date, loc); }}
                  >
                    ×
                  </button>
                {/if}
              </span>
            {/each}
          </div>
        {/if}
      {/if}
    {:else if isInlineEditing("description")}
      <!-- Blank cell with inline edit active: show description input -->
      <InlineEditor
        field="description"
        value=""
        {show}
        onchange={(v) => oninlinechange?.({ description: v })}
        oncommit={() => oncommitinline?.()}
        oncancel={() => oncancelinline?.()}
        onnextfield={() => onstartinlineedit?.(cell.date, "notes")}
      />
    {/if}

    <!-- Conflicts are sourced from doc.conflicts, independent of whether
         a ScheduleDay entry exists for this date. Keep the footer outside
         the `day` guard so clearing or never-committing a day still shows
         "this actor is unavailable" context on the grid. -->
    {#if conflictedMembers.length > 0}
      <div class="conflict-footer">
        <span class="conflict-icon"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" fill="currentColor"><path d="M324-111.5Q251-143 197-197t-85.5-127Q80-397 80-480t31.5-156Q143-709 197-763t127-85.5Q397-880 480-880t156 31.5Q709-817 763-763t85.5 127Q880-563 880-480t-31.5 156Q817-251 763-197t-127 85.5Q563-80 480-80t-156-31.5ZM480-160q54 0 104-17.5t92-50.5L228-676q-33 42-50.5 92T160-480q0 134 93 227t227 93Zm252-124q33-42 50.5-92T800-480q0-134-93-227t-227-93q-54 0-104 17.5T284-732l448 448ZM480-480Z"/></svg></span>
        <span class="conflict-names">
          {conflictedMembers
            .map((m) => displayNames.get(m.id) ?? m.firstName)
            .join(", ")}
        </span>
      </div>
    {/if}
    {#if doubleBookedNames.length > 0}
      <span
        class="overlap-warning"
        title={`Double-booked: ${doubleBookedNames.join(", ")}. Open the day editor to fix.`}
        aria-label={`Double-booked: ${doubleBookedNames.join(", ")}`}
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true">
          <path d="m40-120 440-760 440 760H40Zm138-80h604L480-720 178-200Zm302-40q17 0 28.5-11.5T520-280q0-17-11.5-28.5T480-320q-17 0-28.5 11.5T440-280q0 17 11.5 28.5T480-240Zm-40-120h80v-200h-80v200Zm40-100Z"/>
        </svg>
      </span>
    {/if}
  {/if}
</div>

<style>
  .cell {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: calc(var(--space-1) * var(--cell-scale, 1));
    min-height: var(--cell-min-height, 7rem);
    padding: calc(var(--space-2) * var(--cell-scale, 1));
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    cursor: pointer;
    font-size: calc(1rem * var(--cell-scale, 1));
    transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
    text-align: left;
  }

  .cell:hover:not(.placeholder) {
    border-color: var(--color-teal);
  }

  .cell:focus-visible {
    outline: 2px solid var(--color-teal);
    outline-offset: 1px;
  }

  .cell.placeholder {
    background: var(--color-bg-alt);
    border-style: dashed;
    cursor: default;
    opacity: 0.45;
  }


  .cell.selected {
    border-color: var(--color-plum);
    box-shadow: 0 0 0 2px var(--color-plum);
  }

  .cell.range-selected {
    border-color: var(--color-teal);
    background: rgba(56, 129, 125, 0.06);
  }

  /* A chip is hovering over this cell mid-drag. Accent with teal so the
     drop target reads instantly without obscuring the cell content. */
  .cell.drag-hot {
    border-color: var(--color-teal);
    box-shadow: 0 0 0 2px var(--color-teal);
    background: var(--color-info-bg);
  }

  .cell.shake {
    animation: shake 400ms ease;
    border-color: var(--color-danger);
    box-shadow: 0 0 0 2px var(--color-danger);
    background: var(--color-danger-bg);
  }

  @keyframes shake {
    0%, 100% { transform: translateX(0); }
    15% { transform: translateX(-4px); }
    30% { transform: translateX(4px); }
    45% { transform: translateX(-3px); }
    60% { transform: translateX(3px); }
    75% { transform: translateX(-2px); }
    90% { transform: translateX(2px); }
  }

  .crew-chip {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    font-size: var(--size-cast-badge, 0.6875em);
    font-weight: 600;
    color: var(--color-text);
    padding: 2px var(--space-1) 2px var(--space-2);
    border: 1px solid var(--color-border);
    border-left: 2px solid var(--crew-color);
    border-radius: var(--radius-full, 999px);
    background: var(--color-surface);
    max-width: 100%;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    line-height: 1.2;
  }
  .crew-chip.grabbable,
  .all-called-mini.grabbable {
    cursor: grab;
  }
  .crew-chip.grabbable:active,
  .all-called-mini.grabbable:active {
    cursor: grabbing;
  }

  .crew-chip-square {
    width: 5px;
    height: 5px;
    border-radius: 1px;
    flex-shrink: 0;
  }

  .crew-chip-name {
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .crew-chip .crew-chip-x {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: 10px;
    height: 10px;
    padding: 0;
    margin-left: 2px;
    border: none;
    background: transparent;
    color: var(--crew-color);
    font-size: 0.75rem;
    line-height: 1;
    cursor: pointer;
    border-radius: var(--radius-full);
    opacity: 0;
    transition: opacity var(--transition-fast), background var(--transition-fast);
  }

  .crew-chip:hover .crew-chip-x {
    opacity: 1;
  }

  .crew-chip .crew-chip-x:hover {
    background: var(--color-danger);
    color: var(--color-text-inverse);
  }

  .all-called-mini {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    padding: 1px var(--space-2);
    /* background is set inline via style:background from settings */
    background: #5b1a2b;
    color: var(--color-text-inverse);
    border-radius: var(--radius-sm);
    font-size: 0.625em;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .all-mini-dot {
    width: 4px;
    height: 4px;
    border-radius: var(--radius-full);
    background: var(--color-text-inverse);
    flex-shrink: 0;
  }
  .mini-x {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 10px;
    height: 10px;
    padding: 0;
    margin-left: 2px;
    border: none;
    background: transparent;
    color: var(--color-text-inverse);
    font-size: 0.75em;
    line-height: 1;
    cursor: pointer;
    border-radius: var(--radius-full);
    opacity: 0;
    transition: opacity var(--transition-fast), background var(--transition-fast);
  }
  .all-called-mini:hover .mini-x {
    opacity: 1;
  }
  .mini-x:hover {
    background: rgba(0, 0, 0, 0.25);
  }

  .cell.today .day-number {
    background: var(--color-teal);
    color: var(--color-text-inverse);
    border-radius: var(--radius-full);
    width: 1.5rem;
    height: 1.5rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .cell-header {
    display: flex;
    align-items: flex-start;
    gap: var(--space-1);
  }

  /* Badge group takes all remaining space after the day number so
     badges can pack side-by-side when there's room. direction:rtl
     puts the primary (first in DOM) at the right edge; secondaries
     fill leftward and wrap to the next line. */
  .badge-group {
    display: flex;
    flex-wrap: wrap;
    gap: 2px;
    flex: 1;
    min-width: 0;
    direction: rtl;
  }

  .badge-group .badge {
    direction: ltr;
  }

  .holiday-badge {
    display: inline-block;
    font-size: 0.5625em;
    font-weight: 600;
    color: #b45309;
    background: #fef3c7;
    border: 1px solid #fcd34d;
    border-radius: var(--radius-full);
    padding: 0 0.4em;
    line-height: 1.6;
    white-space: nowrap;
  }

  .day-number {
    font-weight: 700;
    color: var(--color-plum);
    font-size: 0.875em;
  }

  .day-month {
    font-weight: 500;
    color: var(--color-text-muted);
    font-size: 0.8125em;
    margin-left: 5px;
  }

  .placeholder .day-number {
    color: var(--color-text-subtle);
    font-weight: 500;
  }

  .badge {
    display: inline-flex;
    align-items: center;
    padding: 1px var(--space-2);
    border-radius: var(--radius-sm);
    font-size: var(--size-event-type, 0.625em);
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* The ✕ remove button: completely collapsed when not hovered so it
   * doesn't reserve any right-side padding on the badge. Smoothly
   * expands in-place when the badge is hovered. */
  .badge-remove {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 0;
    height: 11px;
    margin-left: 0;
    padding: 0;
    border: none;
    background: transparent;
    color: inherit;
    font-size: 0.85em;
    line-height: 1;
    cursor: pointer;
    border-radius: var(--radius-full);
    opacity: 0;
    overflow: hidden;
    transition:
      opacity var(--transition-fast),
      width var(--transition-fast),
      margin-left var(--transition-fast),
      background var(--transition-fast);
    flex-shrink: 0;
  }
  .badge.removable:hover .badge-remove,
  .badge-remove:focus-visible {
    width: 11px;
    margin-left: 2px;
    opacity: 1;
  }
  .badge-remove:hover {
    background: rgba(0, 0, 0, 0.18);
  }


  .curtain-time {
    font-size: 0.6875em;
    font-weight: 700;
    letter-spacing: 0.02em;
  }

  .curtain-label {
    letter-spacing: 0.06em;
  }

  .dp-cell-call {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 1px;
    font-size: 0.6875em;
    line-height: 1.3;
    color: var(--color-text);

  }

  /* Hover-to-show ✕ buttons on day-level items: calls, notes, locations.
   * All share the same opacity / hover treatment as the cast chip ✕. */
  .call-remove,
  .notes-remove,
  .loc-remove {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 12px;
    height: 12px;
    padding: 0;
    border: none;
    background: rgba(0, 0, 0, 0.06);
    color: var(--color-text);
    font-size: 0.75rem;
    line-height: 1;
    cursor: pointer;
    border-radius: var(--radius-full);
    opacity: 0;
    transition: opacity var(--transition-fast), background var(--transition-fast);
    flex-shrink: 0;
  }
  .call-remove {
    position: absolute;
    top: 2px;
    right: 2px;
  }
  .notes-remove,
  .loc-remove {
    margin-left: 2px;
  }
  .call-block.removable:hover .call-remove,
  .dp-cell-call.removable:hover .call-remove,
  .notes-line.removable:hover .notes-remove,
  .loc-pill.removable:hover .loc-remove,
  .call-remove:focus-visible,
  .notes-remove:focus-visible,
  .loc-remove:focus-visible {
    opacity: 1;
  }
  .call-remove:hover,
  .notes-remove:hover,
  .loc-remove:hover {
    background: var(--color-danger);
    color: var(--color-text-inverse);
  }

  .dp-cell-header {
    display: flex;
    align-items: baseline;
    gap: var(--space-2);
  }

  .dp-inline-labels {
    display: flex;
    align-items: baseline;
    gap: var(--space-1);
  }

  .dp-cell-label {
    font-weight: 700;
    white-space: nowrap;
  }

  .dp-cell-suffix {
    font-weight: 700;
    white-space: nowrap;
    margin-left: 0.25em;
  }

  .dp-cell-time {
    font-weight: 500;
    white-space: nowrap;
  }

  .dp-chips-row {
    margin-top: var(--space-1);
  }

  .call-block {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .call-block.multi + .call-block.multi {
    padding-top: var(--space-1);
    border-top: 1px solid var(--color-border);
  }

  .call-block.call-drag-hot {
    background: var(--color-info-bg);
    border-color: var(--color-teal);
    border-radius: var(--radius-sm);
    outline: 2px solid var(--color-teal);
    outline-offset: -1px;
  }

  .call-block {
    color: var(--time-color, var(--color-text));
  }

  .time {
    font-size: var(--size-time, 0.6875em);
    font-weight: 700;
    white-space: nowrap;
  }

  .call-desc {
    font-size: var(--size-description, 0.6875em);
    line-height: 1.25;
    opacity: 0.85;
    word-break: break-word;
  }

  .call-desc-empty {
    min-height: 0.5rem;
  }

  .inline-time-row {
    display: flex;
    align-items: center;
    gap: 2px;
  }

  .inline-time-sep {
    font-size: 0.6875em;
    color: var(--color-text-muted);
  }

  .description {
    font-size: 0.75em;
    color: var(--color-text-muted);
    line-height: 1.3;
    word-break: break-word;
  }

  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 2px;
  }

  .notes-line {
    display: flex;
    align-items: flex-start;
    gap: var(--space-1);
    font-size: var(--size-notes, 0.625em);
    color: var(--color-text-muted);
    font-style: italic;
    line-height: 1.3;
    margin-top: var(--space-1);
  }

  .notes-text {
    word-break: break-word;
    min-width: 0;
  }

  /* Flatten block-level wrappers from the rich-text editor so a single
     note doesn't push the cell taller than a line or two. strong/em stay
     styled so bold/italic formatting still reads. */
  :global(.notes-text p) {
    display: inline;
    margin: 0;
  }
  :global(.notes-text p + p)::before {
    content: " ";
  }
  :global(.notes-text br) {
    display: none;
  }
  :global(.notes-text strong),
  :global(.notes-text b) {
    font-weight: 700;
  }
  :global(.notes-text em),
  :global(.notes-text i) {
    font-style: italic;
  }
  /* Font-size changes from the editor's size picker emit legacy <font>
     tags; flatten their spacing but keep the relative bump so directors
     still get a visual emphasis in the cell without blowing out the
     line-clamped 2-line budget. */
  :global(.notes-text font[size="1"]) {
    font-size: 0.9em;
  }
  :global(.notes-text font[size="2"]) {
    font-size: 0.95em;
  }
  :global(.notes-text font[size="3"]) {
    font-size: 1em;
  }
  :global(.notes-text font[size="4"]) {
    font-size: 1.05em;
  }
  :global(.notes-text font[size="5"]) {
    font-size: 1.15em;
  }
  :global(.notes-text font[size="6"]) {
    font-size: 1.2em;
  }
  :global(.notes-text font[size="7"]) {
    font-size: 1.25em;
  }

  .location-footer {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
    margin-top: auto;
    padding-top: var(--space-1);
    border-top: 1px solid var(--color-border);
  }

  .loc-pill {
    font-size: var(--size-location, 0.625em);
    font-weight: 700;
    color: var(--loc-color);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    white-space: nowrap;
  }

  .loc-shape {
    margin-right: 2px;
  }

  .conflict-footer {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    padding-top: var(--space-1);
    margin-top: var(--space-1);
    border-top: 1px solid var(--color-danger-bg);
    background: var(--color-danger-bg);
    border-radius: var(--radius-sm);
    padding: var(--space-1) var(--space-2);
    font-size: var(--size-conflicts, 0.625em);
    color: var(--color-danger);
    font-weight: 700;
  }

  .conflict-icon {
    flex-shrink: 0;
    display: flex;
  }

  .conflict-icon svg {
    width: 1em;
    height: 1em;
  }

  .conflict-names {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }

  /* Small amber triangle in the cell when any actor is in two
   * overlapping calls on this day. The day editor's full warning UI
   * is the source of truth; this just nudges the user to look. */
  .overlap-warning {
    position: absolute;
    top: 4px;
    right: 4px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: #b45309;
    background: #fef3c7;
    border: 1px solid #fcd34d;
    border-radius: var(--radius-full);
    width: 16px;
    height: 16px;
    pointer-events: auto;
    cursor: help;
  }
  .overlap-warning svg {
    width: 11px;
    height: 11px;
  }
</style>
