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
    onremovegroup?: (date: IsoDate, callId: string, groupId: string) => void;
    onremoveallcalled?: (date: IsoDate, callId: string) => void;
    ondropactor?: (date: IsoDate, actorId: string, callId?: string) => void;
    ondropgroup?: (date: IsoDate, groupId: string, callId?: string) => void;
    ondropallcalled?: (date: IsoDate, callId?: string) => void;
    filterStart?: IsoDate;
    filterEnd?: IsoDate;
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
    onremovegroup,
    onremoveallcalled,
    ondropactor,
    ondropgroup,
    ondropallcalled,
    filterStart,
    filterEnd,
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

  /** Build a flat list of days with content, tagged with month for grouping. */
  const listDays = $derived.by<ListDay[]>(() => {
    const rangeStart = filterStart ?? show.show.startDate;
    const rangeEnd = filterEnd ?? show.show.endDate;
    const days: ListDay[] = [];
    for (const iso of eachDayOfRange(rangeStart, rangeEnd)) {
      const day = show.schedule[iso];
      if (!day) continue;
      if (day.calls.length === 0 && !day.description && !day.notes) continue;
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
  const displayNames = $derived(castDisplayNames(show.cast, displayMode));
  const timeFmt = $derived(show.settings.timeFormat ?? "12h");

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
      types.includes("text/rb-group") ||
      types.includes("text/rb-all-called")
    );
  }

  function dispatchDrop(dt: DataTransfer, date: IsoDate, callId?: string) {
    const actorId = dt.getData("text/rb-actor");
    if (actorId) {
      if (dayConflicts(date).some((c) => c.actorId === actorId)) return;
      ondropactor?.(date, actorId, callId);
      return;
    }
    const groupId = dt.getData("text/rb-group");
    if (groupId) {
      ondropgroup?.(date, groupId, callId);
      return;
    }
    if (dt.getData("text/rb-all-called") === "1") {
      ondropallcalled?.(date, callId);
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

    {#if monthBreaks.has(i)}
      <h3 class="month-header">{MONTH_NAMES[entry.month]} {entry.year}</h3>
    {/if}

    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="list-day"
      class:selected={selectedDate === iso}
      class:range-selected={selectedDates.has(iso)}
      class:drag-hot={isDayDragHot(iso)}
      role="button"
      tabindex={0}
      aria-label={`Edit ${iso}`}
      onclick={(e) => handleDayClick(e, iso)}
      ondblclick={(e) => { if (clickTimer) { clearTimeout(clickTimer); clickTimer = null; } handleListDayDblClick(e, iso, day); }}
      onkeydown={(e) => {
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
            style:background={et.bgColor}
            style:color={et.textColor}
          >
            {et.name}
          </span>
        {/if}
        {#if day.secondaryTypeIds}
          {#each day.secondaryTypeIds as secId (secId)}
            {@const secType = show.eventTypes.find((t) => t.id === secId)}
            {#if secType}
              <span
                class="badge"
                style:background={secType.bgColor}
                style:color={secType.textColor}
              >
                {secType.name}
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
              <span class="all-called-chip">
                <span class="all-dot" aria-hidden="true"></span>
                All Called
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
        {#if day.location}
          {@const color = locColor(day.location)}
          <div class="location" style:color={color}>
            <span class="loc-shape">{locShape(day.location)}</span> {day.location}
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
            style:border-left-color={color ?? "var(--color-border)"}
            ondragenter={(e) => handleCallDragEnter(e, iso, call.id)}
            ondragover={handleCallDragOver}
            ondragleave={(e) => handleCallDragLeave(e, iso, call.id)}
            ondrop={(e) => handleCallDrop(e, iso, call.id)}
          >
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
                <span class="call-location" style:color={color}>@ {loc}</span>
              {/if}
            </div>
            {#if call.allCalled}
              <div class="chips">
                <span class="all-called-chip">
                  <span class="all-dot" aria-hidden="true"></span>
                  All Called
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
                    onremove={onremoveactor
                      ? () => onremoveactor(iso, call.id, member.id)
                      : undefined}
                  />
                {/each}
              </div>
            {/if}
          </div>
        {/each}
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
        <div class="day-notes" title={notes}>
          {@html day.notes}
        </div>
      {/if}

      {#if conflicts.length > 0}
        <div class="conflict-footer">
          <span class="conflict-icon">🚫</span>
          <span class="conflict-names">
            {conflicts.map((m) => displayNames.get(m.id) ?? m.firstName).join(", ")}
          </span>
        </div>
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
    padding: var(--space-3) var(--space-4);
    border-bottom: 1px solid var(--color-border);
    cursor: pointer;
    border-left: 3px solid transparent;
    transition:
      background var(--transition-fast),
      border-color var(--transition-fast);
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
    font-size: 0.6875rem;
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
    margin: var(--space-1) 0;
    padding: var(--space-2) var(--space-2) var(--space-2) var(--space-3);
    border-left: 3px solid var(--color-border);
    border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
    transition: background var(--transition-fast), border-left-color var(--transition-fast);
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

  .call-desc {
    color: var(--color-text-muted);
  }

  .call-location {
    font-size: 0.75rem;
    color: var(--color-text-muted);
  }

  .loc-shape {
    font-size: 0.6875rem;
    margin-right: 2px;
  }

  .location {
    font-size: 0.8125rem;
    margin-top: var(--space-1);
    padding-left: var(--space-3);
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
    font-size: 0.6875rem;
    font-weight: 600;
    background: var(--color-surface-raised, #f3f4f6);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-full);
    padding: 1px 7px;
  }

  .all-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--color-teal);
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
    font-size: 0.75rem;
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
    font-size: 0.75rem;
  }

  .conflict-icon {
    font-size: 0.6875rem;
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
