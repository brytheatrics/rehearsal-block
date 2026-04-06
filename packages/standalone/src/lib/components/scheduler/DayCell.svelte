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
    effectiveDescription,
    effectiveLocation,
    expandCalledActorIds,
    formatTime,
    locationColor,
  } from "@rehearsal-block/core";
  import CastChip from "./CastChip.svelte";
  import GroupChip from "./GroupChip.svelte";

  interface Props {
    cell: CalendarCell;
    day: ScheduleDay | undefined;
    show: ScheduleDoc;
    selected: boolean;
    onselect: (date: string) => void;
    /**
     * Remove an actor from a specific call on this day (from a direct
     * cast chip's × button).
     */
    onremoveactor?: (date: string, callId: string, actorId: string) => void;
    /**
     * Remove a group from a specific call on this day (from a group
     * chip's × button). Group chips are rendered as single units, so
     * the user removes the whole group instead of expanding it.
     */
    onremovegroup?: (date: string, callId: string, groupId: string) => void;
    /**
     * Clear the allCalled flag on a specific call (from the All Called
     * chip's × button).
     */
    onremoveallcalled?: (date: string, callId: string) => void;
    /**
     * Drop handlers for the sidebar chips. Day cells become drop targets;
     * these fire after the drop event is validated.
     */
    /**
     * Drop handlers. When the day has multiple populated calls, the
     * drop target is the individual `.call-block` div, so the chip
     * lands on the specific call the user aimed at. When the day is
     * blank or has only skeleton calls, the whole cell is the target
     * and `callId` is undefined (parent creates a call to put it in).
     */
    ondropactor?: (date: string, actorId: string, callId?: string) => void;
    ondropgroup?: (date: string, groupId: string, callId?: string) => void;
    ondropallcalled?: (date: string, callId?: string) => void;
  }

  const {
    cell,
    day,
    show,
    selected,
    onselect,
    onremoveactor,
    onremovegroup,
    onremoveallcalled,
    ondropactor,
    ondropgroup,
    ondropallcalled,
  }: Props = $props();

  const eventType = $derived<EventType | undefined>(
    day ? show.eventTypes.find((t) => t.id === day.eventTypeId) : undefined,
  );

  /** Current cast display mode, applied to every chip in the cell. */
  const displayMode = $derived(show.settings.castDisplayMode ?? "actor");

  /**
   * Disambiguated display names for every cast member. Computed once
   * per day cell render and looked up per chip; the map respects the
   * current display mode so the grid shows actor, character, or both
   * labels consistently.
   */
  const displayNames = $derived(castDisplayNames(show.cast, displayMode));

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

  /** Groups called on this call, in calledGroupIds order. */
  function callGroups(call: Call): Group[] {
    if (call.allCalled) return [];
    return call.calledGroupIds
      .map((gid) => show.groups.find((g) => g.id === gid))
      .filter((g): g is Group => !!g);
  }

  /** Cast members with at least one conflict today (any kind). */
  const conflictedMembers = $derived.by<CastMember[]>(() => {
    if (dayConflicts.length === 0) return [];
    const ids = new Set(dayConflicts.map((c) => c.actorId));
    return show.cast.filter((m) => ids.has(m.id));
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

  function isCallPopulated(call: Call): boolean {
    // Dress/perf calls are "populated" as soon as they have a time set -
    // the label + time is all they need to render in the grid.
    if (isDressPerf) return call.time !== "";
    if (call.allCalled) return true;
    if (call.calledActorIds.length > 0) return true;
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
  const uniqueLocations = $derived.by<string[]>(() => {
    if (!day) return [];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const call of populatedCalls) {
      const loc = effectiveLocation(day, call).trim();
      if (loc && !seen.has(loc)) {
        seen.add(loc);
        out.push(loc);
      }
    }
    return out;
  });

  function handleClick() {
    if (!cell.inRange) return;
    onselect(cell.date);
  }

  function handleKey(e: KeyboardEvent) {
    if (!cell.inRange) return;
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
      types.includes("text/rb-group") ||
      types.includes("text/rb-all-called")
    );
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
    const actorId = dt.getData("text/rb-actor");
    if (actorId) {
      if (actorHasConflict(actorId)) {
        triggerShake();
        return;
      }
      ondropactor?.(cell.date, actorId, callId);
      return;
    }
    const groupId = dt.getData("text/rb-group");
    if (groupId) {
      ondropgroup?.(cell.date, groupId, callId);
      return;
    }
    if (dt.getData("text/rb-all-called") === "1") {
      ondropallcalled?.(cell.date, callId);
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
  class:today={cell.isToday}
  class:drag-hot={cellIsDragHot}
  class:shake={shaking}
  role={cell.inRange ? "button" : "presentation"}
  tabindex={cell.inRange ? 0 : undefined}
  onclick={handleClick}
  onkeydown={handleKey}
  ondragenter={handleCellDragEnter}
  ondragover={handleCellDragOver}
  ondragleave={handleCellDragLeave}
  ondrop={handleCellDrop}
  aria-label={cell.inRange ? `Edit ${cell.date}` : undefined}
  aria-hidden={cell.inRange ? undefined : "true"}
>
  <div class="cell-header">
    <span class="day-number">{cell.dayOfMonth}</span>
    <div class="badge-group">
      {#if eventType}
        <span
          class="badge badge-primary"
          style:background={eventType.bgColor}
          style:color={eventType.textColor}
        >
          {eventType.name}
        </span>
      {/if}
      {#if day?.secondaryTypeIds}
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
  </div>

  {#if cell.inRange && day?.curtainTime && eventType?.isDressPerf}
    <div class="curtain-time" style:color={eventType.textColor}>
      {fmtTime(day.curtainTime)} <span class="curtain-label">CURTAIN</span>
    </div>
  {/if}

  {#if cell.inRange}
    {#if day}
      {#if populatedCalls.length === 0}
        <!-- No populated calls: day may still show a day-level description
             (content) and/or notes. Times + locations stay hidden until the
             director adds actors / descriptions to individual calls. -->
        {#if day.description}
          <div class="description">{day.description}</div>
        {/if}
        {#if notesPlain}
          <div class="notes-line" title={notesPlain}>
            <!-- Trust: day.notes is written locally by the director via
                 the editor's contenteditable. Never sourced from another
                 user, so {@html} is safe here. -->
            <span class="notes-text">{@html day.notes}</span>
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
            ondragenter={(e) => handleCallDragEnter(e, call.id)}
            ondragover={handleCallDragOver}
            ondragleave={() => handleCallDragLeave(call.id)}
            ondrop={(e) => handleCallDrop(e, call.id)}
          >
            <div class="dp-cell-header">
              <span class="dp-cell-label">{call.label ? `${call.label} ${suffix}` : suffix}</span>
              <span class="dp-cell-time">{fmtTime(call.time)}</span>
            </div>
          </div>
        {/each}
        {#if notesPlain}
          <div class="notes-line" title={notesPlain}>
            <span class="notes-text">{@html day.notes}</span>
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
              <span class="all-called-mini">
                <span class="all-mini-dot" aria-hidden="true"></span>
                All Called
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
        {#if day.location}
          {@const color = locationColor(day.location)}
          <div class="location-footer">
            <span
              class="loc-pill"
              style:--loc-color={color ?? "var(--color-text-muted)"}
            >
              {day.location}
            </span>
          </div>
        {/if}
      {:else}
        {#each populatedCalls as call (call.id)}
          {@const desc = effectiveDescription(day, call)}
          {@const loc = effectiveLocation(day, call)}
          {@const color = loc ? locationColor(loc) : null}
          {@const groupsForCall = callGroups(call)}
          {@const individuals = directMembers(call)}
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div
            class="call-block"
            class:multi={day.calls.length > 1}
            class:call-drag-hot={isCallDragHot(call.id)}
            style:--time-color={color ?? "var(--color-text)"}
            ondragenter={(e) => handleCallDragEnter(e, call.id)}
            ondragover={handleCallDragOver}
            ondragleave={() => handleCallDragLeave(call.id)}
            ondrop={(e) => handleCallDrop(e, call.id)}
          >
            <div class="time">{timeRange(call)}</div>
            {#if desc}
              <div class="call-desc">{desc}</div>
            {/if}
            {#if call.allCalled}
              <div class="chips">
                <span class="all-called-mini">
                  <span class="all-mini-dot" aria-hidden="true"></span>
                  All Called
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
              </div>
            {:else if groupsForCall.length > 0 || individuals.length > 0}
              <div class="chips">
                {#each groupsForCall as group (group.id)}
                  <GroupChip
                    {group}
                    compact
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
                    onremove={onremoveactor
                      ? () => onremoveactor(cell.date, call.id, member.id)
                      : undefined}
                  />
                {/each}
              </div>
            {/if}
          </div>
        {/each}
        {#if notesPlain}
          <div class="notes-line" title={notesPlain}>
            <!-- Trust: day.notes is written locally by the director via
                 the editor's contenteditable. Never sourced from another
                 user, so {@html} is safe here. -->
            <span class="notes-text">{@html day.notes}</span>
          </div>
        {/if}
        {#if uniqueLocations.length > 0}
          <div class="location-footer">
            {#each uniqueLocations as loc (loc)}
              {@const color = locationColor(loc)}
              <span
                class="loc-pill"
                style:--loc-color={color ?? "var(--color-text-muted)"}
              >
                {loc}
              </span>
            {/each}
          </div>
        {/if}
      {/if}
    {/if}

    <!-- Conflicts are sourced from doc.conflicts, independent of whether
         a ScheduleDay entry exists for this date. Keep the footer outside
         the `day` guard so clearing or never-committing a day still shows
         "this actor is unavailable" context on the grid. -->
    {#if conflictedMembers.length > 0}
      <div class="conflict-footer">
        <span class="conflict-icon">🚫</span>
        <span class="conflict-names">
          {conflictedMembers
            .map((m) => displayNames.get(m.id) ?? m.firstName)
            .join(", ")}
        </span>
      </div>
    {/if}
  {/if}
</div>

<style>
  .cell {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    min-height: 7rem;
    padding: var(--space-2);
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    cursor: pointer;
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

  .all-called-mini {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    padding: 1px var(--space-2);
    background: #5b1a2b;
    color: var(--color-text-inverse);
    border-radius: var(--radius-sm);
    font-size: 0.625rem;
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
    font-size: 0.75rem;
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

  .day-number {
    font-weight: 700;
    color: var(--color-plum);
    font-size: 0.875rem;
  }

  .placeholder .day-number {
    color: var(--color-text-subtle);
    font-weight: 500;
  }

  .badge {
    padding: 1px var(--space-2);
    border-radius: var(--radius-sm);
    font-size: 0.625rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }


  .curtain-time {
    font-size: 0.6875rem;
    font-weight: 700;
    letter-spacing: 0.02em;
  }

  .curtain-label {
    letter-spacing: 0.06em;
  }

  .dp-cell-call {
    display: flex;
    flex-direction: column;
    gap: 1px;
    font-size: 0.6875rem;
    line-height: 1.3;
    color: var(--color-text);
    padding-top: var(--space-1);
    border-top: 1px dashed var(--color-border);
  }

  .dp-cell-call:first-of-type {
    border-top: none;
    padding-top: 0;
  }

  .dp-cell-header {
    display: flex;
    align-items: baseline;
    gap: var(--space-2);
  }

  .dp-cell-label {
    font-weight: 700;
    white-space: nowrap;
  }

  .dp-cell-time {
    font-weight: 600;
    white-space: nowrap;
  }

  .dp-chips-row {
    margin-top: var(--space-1);
  }

  .call-block {
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .call-block.multi {
    padding-top: var(--space-1);
    border-top: 1px dashed var(--color-border);
  }

  .call-block.multi:first-of-type {
    border-top: none;
    padding-top: 0;
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
    font-size: 0.6875rem;
    font-weight: 700;
    white-space: nowrap;
  }

  .call-desc {
    font-size: 0.6875rem;
    line-height: 1.25;
    opacity: 0.85;
    word-break: break-word;
  }

  .description {
    font-size: 0.75rem;
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
    font-size: 0.625rem;
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
    font-size: 0.625rem;
    font-weight: 700;
    color: var(--loc-color);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    white-space: nowrap;
  }

  .loc-pill::before {
    content: "■ ";
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
    font-size: 0.625rem;
    color: var(--color-danger);
    font-weight: 700;
  }

  .conflict-icon {
    flex-shrink: 0;
  }

  .conflict-names {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }
</style>
