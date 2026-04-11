<script lang="ts">
  /**
   * Dense scrollable list view of the schedule. Same data and interactions
   * as CalendarGrid (click to select, shift/ctrl multi-select, drag-drop)
   * but laid out as a vertical list grouped by month - ideal for directors
   * past the planning phase who want a quick "what's happening" scan.
   */
  import type {
    Call,
    CastMember,
    Conflict,
    EventType,
    Group,
    IsoDate,
    ScheduleDay,
    ScheduleDoc,
  } from "@rehearsal-block/core";
  import {
    blockingConflictsFor,
    castDisplayNames,
    eachDayOfRange,
    effectiveDescription,
    effectiveLocation,
    effectiveLocationColor,
    effectiveLocationShape,
    formatTime,
    overlappingCallsByActor,
    parseIsoDate,
  } from "@rehearsal-block/core";
  import CastChip from "./CastChip.svelte";
  import GroupChip from "./GroupChip.svelte";
  import InlineEditor from "./InlineEditor.svelte";

  type InlineField = "description" | "time" | "endTime" | "notes";

  interface InlineEditState {
    date: IsoDate;
    callId?: string;
    field: InlineField;
  }

  interface Props {
    show: ScheduleDoc;
    selectedDate: IsoDate | null;
    selectedDates?: Set<IsoDate>;
    onselectday: (date: IsoDate, shiftKey?: boolean, ctrlKey?: boolean) => void;
    onremoveactor?: (date: IsoDate, callId: string, actorId: string) => void;
    onremovecrew?: (date: IsoDate, callId: string, crewId: string) => void;
    onremovegroup?: (date: IsoDate, callId: string, groupId: string) => void;
    onremoveallcalled?: (date: IsoDate, callId: string) => void;
    ondropactor?: (date: IsoDate, actorId: string, callId?: string) => void;
    ondropcrew?: (date: IsoDate, crewId: string, callId?: string) => void;
    ondropgroup?: (date: IsoDate, groupId: string, callId?: string) => void;
    ondropallcalled?: (date: IsoDate, callId?: string) => void;
    ondropeventtype?: (date: IsoDate, typeId: string) => void;
    ondroplocation?: (date: IsoDate, locName: string, callId?: string) => void;
    ondropcall?: (date: IsoDate) => void;
    ondropnote?: (date: IsoDate) => void;
    onmoveactor?: (date: IsoDate, sourceCallId: string, targetCallId: string, actorId: string) => void;
    onmovecrew?: (date: IsoDate, sourceCallId: string, targetCallId: string, crewId: string) => void;
    onmovegroup?: (date: IsoDate, sourceCallId: string, targetCallId: string, groupId: string) => void;
    onmoveallcalled?: (date: IsoDate, sourceCallId: string, targetCallId: string) => void;
    onremoveeventtype?: (date: IsoDate, typeId: string) => void;
    onremovecall?: (date: IsoDate, callId: string) => void;
    onremovenotes?: (date: IsoDate) => void;
    onremovedaylocation?: (date: IsoDate, locName: string) => void;
    filterStart?: IsoDate;
    filterEnd?: IsoDate;
    /** Set of ISO dates that fail the person/event-type/location
     *  filters. Excluded from the list entirely (not just grayed). */
    excludedDates?: Set<string>;
    inlineEdit?: InlineEditState | null;
    onstartinlineedit?: (date: IsoDate, field: InlineField, callId?: string) => void;
    oninlinechange?: (patch: Partial<ScheduleDay>) => void;
    oninlinecallchange?: (callId: string, patch: Partial<Call>) => void;
    oncommitinline?: () => void;
    oncancelinline?: () => void;
  }

  const {
    show,
    selectedDate,
    selectedDates = new Set(),
    onselectday,
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
    filterStart,
    filterEnd,
    excludedDates,
    inlineEdit,
    onstartinlineedit,
    oninlinechange,
    oninlinecallchange,
    oncommitinline,
    oncancelinline,
  }: Props = $props();

  function isInlineEditing(iso: IsoDate, field: InlineField, callId?: string): boolean {
    if (!inlineEdit || inlineEdit.date !== iso) return false;
    if (callId) return inlineEdit.callId === callId && inlineEdit.field === field;
    return !inlineEdit.callId && inlineEdit.field === field;
  }

  /**
   * Handle double-click on a list-day row. Walk composedPath to find what
   * was targeted - Svelte 5 may rerender on the first click, replacing
   * the original element before dblclick fires.
   */
  function handleListDayDblClick(e: MouseEvent, iso: IsoDate, day: ScheduleDay) {
    if (!onstartinlineedit) return;
    const path = (e.composedPath?.() ?? [e.target]) as EventTarget[];
    for (const node of path) {
      if (!(node instanceof Element)) continue;
      const callBlock = node.closest?.(".list-call");
      const callId = callBlock ? findCallIdFromBlock(callBlock, day) : undefined;

      if (node.classList?.contains("call-time")) {
        onstartinlineedit(iso, "time", callId);
        return;
      }
      if (node.classList?.contains("call-desc") || node.classList?.contains("call-desc-placeholder")) {
        onstartinlineedit(iso, "description", callId);
        return;
      }
      if (node.classList?.contains("day-notes")) {
        onstartinlineedit(iso, "notes");
        return;
      }
      if (node.classList?.contains("list-day")) break;
    }
    // Double-click on empty area - edit first call's description
    const firstCall = populatedCalls(day)[0];
    if (firstCall) {
      onstartinlineedit(iso, "description", firstCall.id);
    }
  }

  function findCallIdFromBlock(el: Element, day: ScheduleDay): string | undefined {
    const parent = el.parentElement;
    if (!parent) return undefined;
    const blocks = parent.querySelectorAll(":scope > .list-call");
    const calls = populatedCalls(day);
    for (let i = 0; i < blocks.length; i++) {
      if (blocks[i] === el) return calls[i]?.id;
    }
    return undefined;
  }

  const MONTH_NAMES = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];

  interface ListDay {
    iso: IsoDate;
    day: ScheduleDay;
    month: number;
    year: number;
  }

  /** Empty day object used as a placeholder for dates that don't have
   *  a schedule entry yet, so the template can render them uniformly. */
  const EMPTY_DAY: ScheduleDay = {
    eventTypeId: "",
    calls: [],
    description: "",
    notes: "",
    location: "",
  };

  /** Build a flat list of days with content, tagged with month for grouping.
   *  When the "Hide blank days" setting is on, only days with meaningful
   *  content (event type, calls, description, or notes) are included.
   *  When off (default), ALL dates in the range are included and truly
   *  empty days render dimmed with just their header row. */
  const hideBlankDays = $derived(show.settings.hideBlankListDays ?? false);
  const listDays = $derived.by<ListDay[]>(() => {
    const rangeStart = filterStart ?? show.show.startDate;
    const rangeEnd = filterEnd ?? show.show.endDate;
    const days: ListDay[] = [];
    for (const iso of eachDayOfRange(rangeStart, rangeEnd)) {
      if (excludedDates?.has(iso)) continue;
      const day = show.schedule[iso] ?? EMPTY_DAY;
      // A day is considered "blank" only when it has ZERO meaningful
      // content: no event type, no calls, no description, no notes.
      // Days with just an event type (e.g. "Dark" days) count as
      // non-blank since the event type communicates intent.
      const isBlank =
        !day.eventTypeId &&
        day.calls.length === 0 &&
        !day.description &&
        !day.notes &&
        !day.location;
      if (hideBlankDays && isBlank) continue;
      const d = parseIsoDate(iso);
      days.push({ iso, day, month: d.getUTCMonth(), year: d.getUTCFullYear() });
    }
    return days;
  });

  /** Group indices where a new month header should appear. */
  const monthBreaks = $derived.by<Set<number>>(() => {
    const breaks = new Set<number>();
    let prevKey = "";
    for (let i = 0; i < listDays.length; i++) {
      const key = `${listDays[i].year}-${listDays[i].month}`;
      if (key !== prevKey) {
        breaks.add(i);
        prevKey = key;
      }
    }
    return breaks;
  });

  const locPresets = $derived(show.locationPresetsV2);
  const displayMode = $derived(show.settings.castDisplayMode ?? "actor");
  const displayNames = $derived(castDisplayNames(show.cast, displayMode, show.crew));
  const timeFmt = $derived(show.settings.timeFormat ?? "12h");
  const allCalledLabel = $derived(
    show.settings.allCalledLabel?.trim() || "All Called",
  );
  const allCalledColor = $derived(
    show.settings.allCalledColor || "#5b1a2b",
  );

  function fmtTime(hhmm: string): string {
    return formatTime(hhmm, timeFmt);
  }

  function timeRange(call: Call): string {
    const start = fmtTime(call.time);
    if (!start || start === "-") return "";
    if (call.endTime) return `${start} \u2013 ${fmtTime(call.endTime)}`;
    return `${start}+`;
  }

  function locColor(name: string): string | null {
    return effectiveLocationColor(name, locPresets);
  }
  function locShape(name: string): string {
    return effectiveLocationShape(name, locPresets);
  }

  function getEventType(day: ScheduleDay): EventType | undefined {
    return show.eventTypes.find((t) => t.id === day.eventTypeId);
  }

  function dayConflicts(iso: IsoDate): Conflict[] {
    return show.conflicts.filter((c) => c.date === iso);
  }

  function conflictedMembers(iso: IsoDate): CastMember[] {
    const conflicts = dayConflicts(iso);
    if (conflicts.length === 0) return [];
    const ids = new Set(conflicts.map((c) => c.actorId));
    return show.cast.filter((m) => ids.has(m.id));
  }

  /** Cast member display names that appear in two or more time-overlapping
   *  calls on this day. Drives the small amber warning indicator on the
   *  list row, mirroring the calendar cell warning. */
  function doubleBookedNamesFor(day: ScheduleDay): string[] {
    if (day.calls.length < 2) return [];
    const overlaps = overlappingCallsByActor(day, show.groups, show.cast);
    if (overlaps.size === 0) return [];
    const out: string[] = [];
    for (const actorId of overlaps.keys()) {
      const member = show.cast.find((m) => m.id === actorId);
      if (member) out.push(displayNames.get(member.id) ?? member.firstName);
    }
    return out;
  }

  function directMembers(call: Call, iso: IsoDate): CastMember[] {
    if (call.allCalled) return [];
    const coveredByGroup = new Set<string>();
    for (const gid of call.calledGroupIds) {
      const g = show.groups.find((x) => x.id === gid);
      if (g) for (const mid of g.memberIds) coveredByGroup.add(mid);
    }
    const conflicts = dayConflicts(iso);
    return show.cast.filter(
      (m) =>
        call.calledActorIds.includes(m.id) &&
        !coveredByGroup.has(m.id) &&
        blockingConflictsFor(m.id, call, conflicts).length === 0,
    );
  }

  function callGroups(call: Call): Group[] {
    if (call.allCalled) return [];
    return call.calledGroupIds
      .map((gid) => show.groups.find((g) => g.id === gid))
      .filter((g): g is Group => !!g);
  }

  function isCallPopulated(call: Call, day: ScheduleDay): boolean {
    const et = getEventType(day);
    if (et?.isDressPerf) return call.time !== "";
    if (call.manuallyAdded) return true;
    if (call.allCalled) return true;
    if (call.calledActorIds.length > 0) return true;
    if (call.calledGroupIds.length > 0) return true;
    if ((call.description ?? "").trim() !== "") return true;
    if ((day.description ?? "").trim() !== "") return true;
    return false;
  }

  function populatedCalls(day: ScheduleDay): Call[] {
    return day.calls.filter((c) => isCallPopulated(c, day));
  }

  /** Unique locations for the day's footer: per-call effective locations
   *  + day.location + day.extraLocations, deduped in encounter order. */
  function uniqueLocations(day: ScheduleDay): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const call of populatedCalls(day)) {
      const loc = effectiveLocation(day, call).trim();
      if (loc && !seen.has(loc)) {
        seen.add(loc);
        out.push(loc);
      }
    }
    const dayLoc = (day.location ?? "").trim();
    if (dayLoc && !seen.has(dayLoc)) {
      seen.add(dayLoc);
      out.push(dayLoc);
    }
    for (const loc of day.extraLocations ?? []) {
      const trimmed = loc.trim();
      if (trimmed && !seen.has(trimmed)) {
        seen.add(trimmed);
        out.push(trimmed);
      }
    }
    return out;
  }

  function notesPlain(day: ScheduleDay): string {
    return day.notes
      ? day.notes.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()
      : "";
  }

  function formatDateLong(iso: IsoDate): string {
    const d = parseIsoDate(iso);
    const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getUTCDay()];
    const month = MONTH_NAMES[d.getUTCMonth()];
    return `${weekday}, ${month} ${d.getUTCDate()}`;
  }

  // --- Drag and drop ---
  // Counter-based approach: dragenter/dragleave fire in pairs when moving
  // between child elements. A simple boolean flickers because leave fires
  // before enter on the next child. Counting entries keeps the highlight
  // stable until the cursor truly exits the container.

  let dayDragCounts = $state<Record<string, number>>({});
  let callDragCounts = $state<Record<string, number>>({});

  function isDayDragHot(iso: IsoDate): boolean {
    return (dayDragCounts[iso] ?? 0) > 0;
  }
  function isCallDragHot(callId: string): boolean {
    return (callDragCounts[callId] ?? 0) > 0;
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

  // --- Move dragstart helpers (reparent chips between calls) ---------
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

  function dispatchDrop(dt: DataTransfer, date: IsoDate, callId?: string) {
    // Move types: reparent an in-cell chip from one call to another on
    // the same day. Only fires when the drop lands on a different call
    // block than the source.
    const moveActorPayload = dt.getData("text/rb-move-actor");
    if (moveActorPayload) {
      const [sourceCallId, actorId] = moveActorPayload.split("|");
      if (callId && sourceCallId && actorId && callId !== sourceCallId) {
        onmoveactor?.(date, sourceCallId, callId, actorId);
      }
      return;
    }
    const moveCrewPayload = dt.getData("text/rb-move-crew");
    if (moveCrewPayload) {
      const [sourceCallId, crewId] = moveCrewPayload.split("|");
      if (callId && sourceCallId && crewId && callId !== sourceCallId) {
        onmovecrew?.(date, sourceCallId, callId, crewId);
      }
      return;
    }
    const moveGroupPayload = dt.getData("text/rb-move-group");
    if (moveGroupPayload) {
      const [sourceCallId, groupId] = moveGroupPayload.split("|");
      if (callId && sourceCallId && groupId && callId !== sourceCallId) {
        onmovegroup?.(date, sourceCallId, callId, groupId);
      }
      return;
    }
    const moveAllCalledSource = dt.getData("text/rb-move-all-called");
    if (moveAllCalledSource) {
      if (callId && callId !== moveAllCalledSource) {
        onmoveallcalled?.(date, moveAllCalledSource, callId);
      }
      return;
    }
    const actorId = dt.getData("text/rb-actor");
    if (actorId) {
      if (dayConflicts(date).some((c) => c.actorId === actorId)) return;
      ondropactor?.(date, actorId, callId);
      return;
    }
    const crewId = dt.getData("text/rb-crew");
    if (crewId) {
      ondropcrew?.(date, crewId, callId);
      return;
    }
    const groupId = dt.getData("text/rb-group");
    if (groupId) {
      ondropgroup?.(date, groupId, callId);
      return;
    }
    if (dt.getData("text/rb-all-called") === "1") {
      ondropallcalled?.(date, callId);
      return;
    }
    const eventTypeId = dt.getData("text/rb-event-type");
    if (eventTypeId) {
      ondropeventtype?.(date, eventTypeId);
      return;
    }
    const locName = dt.getData("text/rb-location");
    if (locName) {
      ondroplocation?.(date, locName, callId);
      return;
    }
    if (dt.getData("text/rb-call") === "1") {
      ondropcall?.(date);
      return;
    }
    if (dt.getData("text/rb-note") === "1") {
      ondropnote?.(date);
      return;
    }
  }

  function handleDayDragEnter(e: DragEvent, iso: IsoDate) {
    if (!hasDragPayload(e)) return;
    e.preventDefault();
    dayDragCounts = { ...dayDragCounts, [iso]: (dayDragCounts[iso] ?? 0) + 1 };
  }

  function handleDayDragOver(e: DragEvent) {
    if (!hasDragPayload(e)) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
  }

  function handleDayDragLeave(e: DragEvent, iso: IsoDate) {
    const prev = dayDragCounts[iso] ?? 0;
    if (prev > 0) {
      dayDragCounts = { ...dayDragCounts, [iso]: prev - 1 };
    }
  }

  function handleDayDrop(e: DragEvent, iso: IsoDate) {
    e.preventDefault();
    dayDragCounts = { ...dayDragCounts, [iso]: 0 };
    if (!e.dataTransfer) return;
    dispatchDrop(e.dataTransfer, iso);
  }

  function handleCallDragEnter(e: DragEvent, iso: IsoDate, callId: string) {
    if (!hasDragPayload(e)) return;
    e.preventDefault();
    e.stopPropagation();
    // Also keep the parent day highlighted
    dayDragCounts = { ...dayDragCounts, [iso]: (dayDragCounts[iso] ?? 0) + 1 };
    callDragCounts = { ...callDragCounts, [callId]: (callDragCounts[callId] ?? 0) + 1 };
  }

  function handleCallDragOver(e: DragEvent) {
    if (!hasDragPayload(e)) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
  }

  function handleCallDragLeave(e: DragEvent, iso: IsoDate, callId: string) {
    const prevCall = callDragCounts[callId] ?? 0;
    if (prevCall > 0) {
      callDragCounts = { ...callDragCounts, [callId]: prevCall - 1 };
    }
    const prevDay = dayDragCounts[iso] ?? 0;
    if (prevDay > 0) {
      dayDragCounts = { ...dayDragCounts, [iso]: prevDay - 1 };
    }
  }

  function handleCallDrop(e: DragEvent, iso: IsoDate, callId: string) {
    e.preventDefault();
    e.stopPropagation();
    dayDragCounts = { ...dayDragCounts, [iso]: 0 };
    callDragCounts = { ...callDragCounts, [callId]: 0 };
    if (!e.dataTransfer) return;
    dispatchDrop(e.dataTransfer, iso, callId);
  }

  // Delay single-click so a double-click can cancel it, preventing
  // the editor panel from opening and shifting the layout mid-dblclick.
  let clickTimer: ReturnType<typeof setTimeout> | null = null;

  function handleDayClick(e: MouseEvent, iso: IsoDate) {
    const shift = e.shiftKey;
    const ctrl = e.ctrlKey || e.metaKey;
    if (clickTimer) clearTimeout(clickTimer);
    clickTimer = setTimeout(() => {
      clickTimer = null;
      onselectday(iso, shift, ctrl);
    }, 250);
  }
</script>

<div class="list-view">
  {#each listDays as entry, i (entry.iso)}
    {@const day = entry.day}
    {@const iso = entry.iso}
    {@const et = getEventType(day)}
    {@const isDressPerf = et?.isDressPerf ?? false}
    {@const calls = populatedCalls(day)}
    {@const notes = notesPlain(day)}
    {@const conflicts = conflictedMembers(iso)}
    {@const overlapNames = doubleBookedNamesFor(day)}
    {@const isBlank = !day.eventTypeId && day.calls.length === 0 && !day.description && !day.notes && !day.location}

    {#if monthBreaks.has(i)}
      <h3 class="month-header">{MONTH_NAMES[entry.month]} {entry.year}</h3>
    {/if}

    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="list-day"
      class:blank={isBlank}
      class:selected={selectedDate === iso}
      class:range-selected={selectedDates.has(iso)}
      class:drag-hot={isDayDragHot(iso)}
      role="button"
      tabindex={0}
      aria-label={`Edit ${iso}`}
      onclick={(e) => handleDayClick(e, iso)}
      ondblclick={(e) => { if (clickTimer) { clearTimeout(clickTimer); clickTimer = null; } handleListDayDblClick(e, iso, day); }}
      onkeydown={(e) => {
        // Only treat Enter / Space as cell activation when the focus is
        // on the row itself. If a descendant input (inline editor) is
        // focused, let the keydown through so spaces can be typed.
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onselectday(iso);
        }
      }}
      ondragenter={(e) => handleDayDragEnter(e, iso)}
      ondragover={handleDayDragOver}
      ondragleave={(e) => handleDayDragLeave(e, iso)}
      ondrop={(e) => handleDayDrop(e, iso)}
    >
      <div class="day-header">
        <span class="day-date">{formatDateLong(iso)}</span>
        {#if et}
          <span
            class="badge"
            class:removable={!!onremoveeventtype}
            style:background={et.bgColor}
            style:color={et.textColor}
          >
            {et.name}
            {#if onremoveeventtype}
              <button
                type="button"
                class="badge-remove"
                aria-label={`Remove ${et.name}`}
                title={`Remove ${et.name}`}
                onclick={(e) => { e.stopPropagation(); onremoveeventtype?.(iso, et.id); }}
              >
                ×
              </button>
            {/if}
          </span>
        {/if}
        {#if day.secondaryTypeIds}
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
                    onclick={(e) => { e.stopPropagation(); onremoveeventtype?.(iso, secType.id); }}
                  >
                    ×
                  </button>
                {/if}
              </span>
            {/if}
          {/each}
        {/if}
      </div>

      {#if isDressPerf && day.curtainTime}
        <div class="dp-curtain" style:color={et?.textColor ?? "#1a1a1a"}>
          {fmtTime(day.curtainTime)} CURTAIN
        </div>
      {/if}

      {#if isDressPerf}
        {#each calls as call (call.id)}
          {@const suffix = call.suffix ?? "Call"}
          {@const label = call.label ? `${call.label} ${suffix}` : suffix}
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div
            class="dp-call-line"
            class:call-drag-hot={isCallDragHot(call.id)}
            ondragenter={(e) => handleCallDragEnter(e, iso, call.id)}
            ondragover={handleCallDragOver}
            ondragleave={(e) => handleCallDragLeave(e, iso, call.id)}
            ondrop={(e) => handleCallDrop(e, iso, call.id)}
          >
            <span class="dp-label">{label}</span>
            <span class="dp-time">{fmtTime(call.time)}</span>
          </div>
        {/each}
        <!-- Consolidated chips for dress/perf -->
        {@const allDpGroups = day.calls.flatMap((c) => callGroups(c))}
        {@const allDpIndividuals = day.calls.flatMap((c) => directMembers(c, iso))}
        {@const anyAllCalled = day.calls.some((c) => c.allCalled)}
        {#if anyAllCalled || allDpGroups.length > 0 || allDpIndividuals.length > 0}
          <div class="chips">
            {#if anyAllCalled}
              <span class="all-called-chip" style:background={allCalledColor}>
                <span class="all-dot" aria-hidden="true"></span>
                {allCalledLabel}
                {#if onremoveallcalled}
                  <button
                    type="button"
                    class="mini-x"
                    aria-label="Uncall everyone"
                    onclick={(e) => {
                      e.stopPropagation();
                      const callWith = day.calls.find((c) => c.allCalled);
                      if (callWith) onremoveallcalled(iso, callWith.id);
                    }}
                  >
                    &times;
                  </button>
                {/if}
              </span>
            {/if}
            {#each allDpGroups as group (group.id)}
              <GroupChip
                {group}
                compact
                onremove={onremovegroup
                  ? () => {
                      const callWith = day.calls.find((c) => c.calledGroupIds.includes(group.id));
                      if (callWith) onremovegroup(iso, callWith.id, group.id);
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
                      const callWith = day.calls.find((c) => c.calledActorIds.includes(member.id));
                      if (callWith) onremoveactor(iso, callWith.id, member.id);
                    }
                  : undefined}
              />
            {/each}
          </div>
        {/if}
        {@const dressPerfLocs = uniqueLocations(day)}
        {#if dressPerfLocs.length > 0}
          <div class="location-row">
            {#each dressPerfLocs as loc (loc)}
              {@const color = locColor(loc)}
              <span class="location" class:removable={!!onremovedaylocation} style:color={color}>
                <span class="loc-shape">{locShape(loc)}</span> {loc}
                {#if onremovedaylocation}
                  <button
                    type="button"
                    class="loc-remove"
                    aria-label={`Remove ${loc}`}
                    title={`Remove ${loc}`}
                    onclick={(e) => { e.stopPropagation(); onremovedaylocation?.(iso, loc); }}
                  >
                    ×
                  </button>
                {/if}
              </span>
            {/each}
          </div>
        {/if}
      {:else}
        <!-- Regular calls -->
        {#each calls as call (call.id)}
          {@const desc = effectiveDescription(day, call)}
          {@const loc = effectiveLocation(day, call).trim()}
          {@const color = loc ? locColor(loc) : null}
          {@const groups = callGroups(call)}
          {@const individuals = directMembers(call, iso)}
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div
            class="list-call"
            class:call-drag-hot={isCallDragHot(call.id)}
            class:removable={!!onremovecall}
            style:border-left-color={color ?? "var(--color-border)"}
            ondragenter={(e) => handleCallDragEnter(e, iso, call.id)}
            ondragover={handleCallDragOver}
            ondragleave={(e) => handleCallDragLeave(e, iso, call.id)}
            ondrop={(e) => handleCallDrop(e, iso, call.id)}
          >
            {#if onremovecall}
              <button
                type="button"
                class="call-remove"
                aria-label="Remove call"
                title="Remove call"
                onclick={(e) => { e.stopPropagation(); onremovecall?.(iso, call.id); }}
              >
                ×
              </button>
            {/if}
            <div class="call-meta">
              {#if isInlineEditing(iso, "time", call.id) || isInlineEditing(iso, "endTime", call.id)}
                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <span class="inline-time-row" onclick={(e) => e.stopPropagation()} ondblclick={(e) => e.stopPropagation()}>
                  <InlineEditor
                    field="time"
                    value={call.time}
                    {show}
                    active={isInlineEditing(iso, "time", call.id)}
                    onchange={(v) => oninlinecallchange?.(call.id, { time: v })}
                    oncommit={() => onstartinlineedit?.(iso, "endTime", call.id)}
                    oncancel={() => oncancelinline?.()}
                  />
                  <span class="inline-time-sep">&ndash;</span>
                  <InlineEditor
                    field="endTime"
                    value={call.endTime ?? ""}
                    {show}
                    active={isInlineEditing(iso, "endTime", call.id)}
                    minTime={call.time}
                    onchange={(v) => oninlinecallchange?.(call.id, { endTime: v || undefined })}
                    oncommit={() => oncommitinline?.()}
                    oncancel={() => oncancelinline?.()}
                  />
                </span>
              {:else if timeRange(call)}
                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <span class="call-time" style:color={color}>{#if show.settings.showLocationShapes && loc}<span class="loc-shape">{locShape(loc)}</span>{/if}{timeRange(call)}</span>
              {/if}
              {#if isInlineEditing(iso, "description", call.id)}
                <InlineEditor
                  field="description"
                  value={desc}
                  {show}
                  onchange={(v) => oninlinecallchange?.(call.id, { description: v })}
                  oncommit={() => oncommitinline?.()}
                  oncancel={() => oncancelinline?.()}
                  onnextfield={() => onstartinlineedit?.(iso, "time", call.id)}
                />
              {:else if desc}
                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <span class="call-desc">{desc}</span>
              {:else}
                <span class="call-desc call-desc-placeholder">&nbsp;</span>
              {/if}
              {#if loc}
                <span class="call-location" style:color={color}>
                  <svg class="loc-pin" xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true"><path d="M536.5-503.5Q560-527 560-560t-23.5-56.5Q513-640 480-640t-56.5 23.5Q400-593 400-560t23.5 56.5Q447-480 480-480t56.5-23.5ZM480-186q122-112 181-203.5T720-552q0-109-69.5-178.5T480-800q-101 0-170.5 69.5T240-552q0 71 59 162.5T480-186Zm0 106Q319-217 239.5-334.5T160-552q0-150 96.5-239T480-880q127 0 223.5 89T800-552q0 100-79.5 217.5T480-80Zm0-480Z"/></svg>
                  {loc}
                </span>
              {/if}
            </div>
            {#if call.allCalled}
              <div class="chips">
                <span
                  class="all-called-chip"
                  class:grabbable={!!onmoveallcalled}
                  style:background={allCalledColor}
                  draggable={onmoveallcalled ? "true" : undefined}
                  ondragstart={onmoveallcalled ? (e) => dragMoveAllCalled(e, call.id) : undefined}
                >
                  <span class="all-dot" aria-hidden="true"></span>
                  {allCalledLabel}
                  {#if onremoveallcalled}
                    <button
                      type="button"
                      class="mini-x"
                      aria-label="Uncall everyone"
                      onclick={(e) => {
                        e.stopPropagation();
                        onremoveallcalled(iso, call.id);
                      }}
                    >
                      &times;
                    </button>
                  {/if}
                </span>
              </div>
            {:else if groups.length > 0 || individuals.length > 0}
              <div class="chips">
                {#each groups as group (group.id)}
                  <GroupChip
                    {group}
                    compact
                    draggable={!!onmovegroup}
                    ondragstart={onmovegroup ? (e) => dragMoveGroup(e, call.id, group.id) : undefined}
                    onremove={onremovegroup
                      ? () => onremovegroup(iso, call.id, group.id)
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
                      ? () => onremoveactor(iso, call.id, member.id)
                      : undefined}
                  />
                {/each}
              </div>
            {/if}
          </div>
        {/each}
        <!-- Note: regular calls show "@ {location}" inline next to each
             call's time (see .call-location above), so we deliberately do
             NOT render a separate location-row footer here - it would
             duplicate the location and waste vertical space. The
             dress/perf branch above DOES need its own location-row
             because those calls don't have an inline location display. -->
      {/if}

      {#if isInlineEditing(iso, "notes")}
        <InlineEditor
          field="notes"
          value={day.notes ?? ""}
          {show}
          onchange={(v) => oninlinechange?.({ notes: v })}
          oncommit={() => oncommitinline?.()}
          oncancel={() => oncancelinline?.()}
        />
      {:else if notes}
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class="day-notes" class:removable={!!onremovenotes} title={notes}>
          {@html day.notes}
          {#if onremovenotes}
            <button
              type="button"
              class="notes-remove"
              aria-label="Remove notes"
              title="Remove notes"
              onclick={(e) => { e.stopPropagation(); onremovenotes?.(iso); }}
            >
              ×
            </button>
          {/if}
        </div>
      {/if}

      {#if conflicts.length > 0}
        <div class="conflict-footer">
          <span class="conflict-icon"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" fill="currentColor"><path d="M324-111.5Q251-143 197-197t-85.5-127Q80-397 80-480t31.5-156Q143-709 197-763t127-85.5Q397-880 480-880t156 31.5Q709-817 763-763t85.5 127Q880-563 880-480t-31.5 156Q817-251 763-197t-127 85.5Q563-80 480-80t-156-31.5ZM480-160q54 0 104-17.5t92-50.5L228-676q-33 42-50.5 92T160-480q0 134 93 227t227 93Zm252-124q33-42 50.5-92T800-480q0-134-93-227t-227-93q-54 0-104 17.5T284-732l448 448ZM480-480Z"/></svg></span>
          <span class="conflict-names">
            {conflicts.map((m) => displayNames.get(m.id) ?? m.firstName).join(", ")}
          </span>
        </div>
      {/if}
      {#if overlapNames.length > 0}
        <span
          class="overlap-warning"
          title={`Double-booked: ${overlapNames.join(", ")}. Open the day editor to fix.`}
          aria-label={`Double-booked: ${overlapNames.join(", ")}`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true">
            <path d="m40-120 440-760 440 760H40Zm138-80h604L480-720 178-200Zm302-40q17 0 28.5-11.5T520-280q0-17-11.5-28.5T480-320q-17 0-28.5 11.5T440-280q0 17 11.5 28.5T480-240Zm-40-120h80v-200h-80v200Zm40-100Z"/>
          </svg>
        </span>
      {/if}
    </div>
  {/each}

  {#if listDays.length === 0}
    <div class="empty">No scheduled days in this date range.</div>
  {/if}
</div>

<style>
  .list-view {
    display: flex;
    flex-direction: column;
    min-width: 0;
    /* Cap the readable column width on wide screens. The list view is
       text-heavy and a 1200+px wide row of left-aligned text leaves a
       huge dead zone on the right. ~620px (roughly the width of three
       calendar columns at desktop) gives a comfortable line length and
       still uses the full viewport on phones since this is a max, not
       a fixed width. Auto-margins center the column horizontally
       between the left and right sidebars. */
    max-width: 620px;
    margin: 0 auto;
    width: 100%;
  }

  .month-header {
    font-family: var(--font-heading, var(--font-display));
    color: var(--color-plum);
    margin: var(--space-4) 0 var(--space-2);
    font-size: 1.25rem;
  }

  .month-header:first-child {
    margin-top: 0;
  }

  .list-day {
    position: relative;
    padding: var(--space-3) var(--space-4);
    border-bottom: 1px solid var(--color-border);
    cursor: pointer;
    border-left: 3px solid transparent;
    transition:
      background var(--transition-fast),
      border-color var(--transition-fast);
  }

  /* Small amber triangle on a row when any actor is in two
   * overlapping calls on this day. Mirrors the calendar cell warning. */
  .overlap-warning {
    position: absolute;
    top: var(--space-2);
    right: var(--space-3);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: #b45309;
    background: #fef3c7;
    border: 1px solid #fcd34d;
    border-radius: var(--radius-full);
    width: 18px;
    height: 18px;
    cursor: help;
  }
  .overlap-warning svg {
    width: 12px;
    height: 12px;
  }

  .list-day:hover {
    background: color-mix(in srgb, var(--color-teal) 6%, transparent);
  }

  .list-day.selected {
    background: color-mix(in srgb, var(--color-teal) 10%, transparent);
    border-left-color: var(--color-teal);
  }

  .list-day.range-selected {
    background: color-mix(in srgb, var(--color-teal) 7%, transparent);
    border-left-color: var(--color-teal);
  }

  .list-day:focus-visible {
    outline: 2px solid var(--color-teal);
    outline-offset: -2px;
  }

  .list-day.drag-hot {
    background: color-mix(in srgb, var(--color-teal) 12%, transparent);
    border-left-color: var(--color-teal);
  }

  /* Blank days (no calls, no description, no notes). Dimmer header
   * color and smaller padding so they don't visually compete with
   * actual rehearsal days. Rendered only when the "Hide blank days
   * in list view" setting is OFF (default). */
  .list-day.blank {
    padding: var(--space-2) var(--space-4);
    opacity: 0.55;
  }
  .list-day.blank .day-date {
    color: var(--color-text-muted);
    font-weight: 500;
  }
  .list-day.blank:hover {
    opacity: 1;
  }

  .day-header {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex-wrap: wrap;
    margin-bottom: var(--space-1);
  }

  .day-date {
    font-family: var(--font-heading, var(--font-display));
    font-size: 0.9375rem;
    font-weight: 700;
    color: var(--color-plum);
  }

  .badge {
    /* Honors the Appearance > Font sizes > Event type setting. The
       --size-* CSS variables are set on .demo-inner so the same scale
       applies in both Calendar and List views. */
    font-size: var(--size-event-type, 0.6875rem);
    font-weight: 600;
    padding: 1px 6px;
    border-radius: var(--radius-full);
    white-space: nowrap;
  }

  /* Dress/perf styles */
  .dp-curtain {
    font-weight: 700;
    font-size: 0.8125rem;
    margin-bottom: var(--space-1);
  }

  .dp-call-line {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-2) var(--space-2) var(--space-3);
    font-size: 0.8125rem;
    border-radius: var(--radius-sm);
    transition: background var(--transition-fast), box-shadow var(--transition-fast);
  }

  .dp-call-line.call-drag-hot {
    background: color-mix(in srgb, var(--color-teal) 15%, transparent);
    box-shadow: inset 2px 0 0 var(--color-teal);
  }

  .dp-label {
    font-weight: 600;
    color: var(--color-text-muted);
  }

  .dp-time {
    font-family: var(--font-time, system-ui);
    font-weight: 700;
  }

  /* Regular call blocks */
  .list-call {
    position: relative;
    margin: var(--space-1) 0;
    padding: var(--space-2) var(--space-2) var(--space-2) var(--space-3);
    border-left: 3px solid var(--color-border);
    border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
    transition: background var(--transition-fast), border-left-color var(--transition-fast);
  }

  /* Hover-to-show ✕ buttons matching the cast chip pattern. */
  .badge-remove,
  .call-remove,
  .notes-remove,
  .loc-remove {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 14px;
    height: 14px;
    padding: 0;
    border: none;
    background: rgba(0, 0, 0, 0.08);
    color: inherit;
    font-size: 0.85rem;
    line-height: 1;
    cursor: pointer;
    border-radius: var(--radius-full);
    opacity: 0;
    transition: opacity var(--transition-fast), background var(--transition-fast);
    flex-shrink: 0;
  }
  .badge {
    display: inline-flex;
    align-items: center;
  }
  /* Collapsed when hidden so the badge has no extra right-side slack;
   * expands in-place on hover. */
  .badge-remove {
    width: 0;
    height: 12px;
    margin-left: 0;
    font-size: 0.75rem;
    overflow: hidden;
    transition:
      opacity var(--transition-fast),
      width var(--transition-fast),
      margin-left var(--transition-fast),
      background var(--transition-fast);
  }
  .call-remove {
    position: absolute;
    top: 4px;
    right: 4px;
  }
  .notes-remove,
  .loc-remove {
    margin-left: 4px;
    vertical-align: middle;
  }
  .badge.removable:hover .badge-remove,
  .badge-remove:focus-visible {
    width: 12px;
    margin-left: 2px;
    opacity: 1;
  }
  .list-call.removable:hover .call-remove,
  .day-notes.removable:hover .notes-remove,
  .location.removable:hover .loc-remove,
  .call-remove:focus-visible,
  .notes-remove:focus-visible,
  .loc-remove:focus-visible {
    opacity: 1;
  }
  .badge-remove:hover,
  .call-remove:hover,
  .notes-remove:hover,
  .loc-remove:hover {
    background: var(--color-danger);
    color: var(--color-text-inverse);
  }

  .list-call.call-drag-hot {
    background: color-mix(in srgb, var(--color-teal) 15%, transparent);
    border-left-color: var(--color-teal);
  }

  .call-meta {
    display: flex;
    align-items: baseline;
    gap: var(--space-2);
    flex-wrap: wrap;
    font-size: 0.8125rem;
  }

  .call-time {
    font-family: var(--font-time, system-ui);
    font-weight: 700;
    font-size: var(--size-time, 0.8125rem);
  }

  .call-desc {
    font-size: var(--size-description, 0.8125rem);
    color: var(--color-text-muted);
  }

  .inline-time-row {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }

  .inline-time-sep {
    font-size: 0.8125rem;
    color: var(--color-text-muted);
  }

  .call-location {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    font-size: var(--size-location, 0.75rem);
    color: var(--color-text-muted);
  }
  .loc-pin {
    width: 0.95em;
    height: 0.95em;
    flex-shrink: 0;
    /* Pin glyph sits a hair high inside its em-box; nudge down so the
       middle of the pin lines up with the text x-height. */
    transform: translateY(0.5px);
  }

  .loc-shape {
    font-size: 0.6875rem;
    margin-right: 2px;
  }

  .location {
    font-size: var(--size-location, 0.8125rem);
    margin-top: var(--space-1);
    padding-left: var(--space-3);
  }

  .location-row {
    display: flex;
    flex-wrap: wrap;
    column-gap: var(--space-3);
    row-gap: 2px;
    margin-top: var(--space-1);
    padding-left: var(--space-3);
  }

  .location-row .location {
    margin-top: 0;
    padding-left: 0;
  }

  .location .loc-shape {
    margin-right: 2px;
  }

  /* Chips */
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 3px;
    margin-top: var(--space-1);
    padding-left: var(--space-1);
  }

  .all-called-chip {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    font-size: var(--size-cast-badge, 0.6875rem);
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    /* background set inline via style:background from settings */
    background: #5b1a2b;
    color: var(--color-text-inverse);
    border-radius: var(--radius-sm);
    padding: 1px 7px;
  }

  .all-dot {
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: var(--color-text-inverse);
  }

  .mini-x {
    all: unset;
    cursor: pointer;
    font-size: 0.75rem;
    color: var(--color-text-muted);
    margin-left: 2px;
    line-height: 1;
  }

  .mini-x:hover {
    color: var(--color-danger, #dc2626);
  }

  /* Notes */
  .day-notes {
    font-size: var(--size-notes, 0.75rem);
    color: var(--color-text-muted);
    font-style: italic;
    margin-top: var(--space-1);
    padding: var(--space-1) var(--space-2);
    background: var(--color-surface-raised, #f9fafb);
    border-radius: var(--radius-sm);
  }

  .day-notes :global(p) {
    margin: 0;
    display: inline;
  }

  .day-notes :global(strong) {
    font-weight: 700;
    font-style: normal;
  }

  /* Conflicts */
  .conflict-footer {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    margin-top: var(--space-1);
    font-size: var(--size-conflicts, 0.75rem);
  }

  .conflict-icon {
    font-size: 0.6875rem;
    display: flex;
  }

  .conflict-icon svg {
    width: 1em;
    height: 1em;
  }

  .conflict-names {
    color: var(--color-danger, #dc2626);
    font-weight: 600;
  }

  .empty {
    padding: var(--space-8);
    text-align: center;
    color: var(--color-text-muted);
    font-size: 0.875rem;
  }
</style>
