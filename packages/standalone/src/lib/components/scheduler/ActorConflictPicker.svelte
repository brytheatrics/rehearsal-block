<script lang="ts">
  /**
   * Per-actor conflict calendar picker. Opens as a modal over the cast
   * editor. Shows the show's date range as a compact 7-column grid;
   * clicking a date toggles a full-day conflict for the given actor.
   * Dates with existing conflicts show in warning colors.
   */
  import type {
    CastMember,
    Conflict,
    IsoDate,
    ScheduleDoc,
  } from "@rehearsal-block/core";
  import {
    buildCalendarGrid,
    formatTime,
    isMonthHeaderRow,
    isWeekRow,
  } from "@rehearsal-block/core";
  import TimePicker from "./TimePicker.svelte";

  interface Props {
    show: ScheduleDoc;
    member: CastMember;
    onaddconflict: (conflict: Conflict) => void;
    onremoveconflict: (id: string) => void;
    onclose: () => void;
  }

  const { show, member, onaddconflict, onremoveconflict, onclose }: Props =
    $props();

  const grid = $derived(
    buildCalendarGrid(show.show, {
      weekStartsOn: show.settings.weekStartsOn,
    }),
  );

  /** Conflicts for this specific actor, keyed by date for fast lookup. */
  const conflictsByDate = $derived.by<Map<string, Conflict>>(() => {
    const map = new Map<string, Conflict>();
    for (const c of show.conflicts) {
      if (c.actorId === member.id) {
        map.set(c.date, c);
      }
    }
    return map;
  });

  /** Date being edited for a partial (timed) conflict. */
  let partialDate = $state<IsoDate | null>(null);
  let partialStart = $state("");
  let partialEnd = $state("");
  let partialLabel = $state("");

  // Which conflicted date is showing Edit/Remove actions
  let activeConflictDate = $state<IsoDate | null>(null);
  // Edit conflict state
  let editingConflict = $state<Conflict | null>(null);
  let editStart = $state("");
  let editEnd = $state("");
  let editLabel = $state("");
  let editKind = $state<"all-day" | "timed">("all-day");

  function handleCellClick(iso: IsoDate, shiftKey: boolean) {
    const existing = conflictsByDate.get(iso);
    if (shiftKey) {
      activeConflictDate = null;
      partialDate = iso;
      partialStart = "";
      partialEnd = "";
      partialLabel = "";
    } else if (existing) {
      // Toggle the edit/remove actions for this date
      activeConflictDate = activeConflictDate === iso ? null : iso;
    } else {
      activeConflictDate = null;
      onaddconflict({
        id: `conf_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        actorId: member.id,
        date: iso,
        label: "",
      });
    }
  }

  function removeActiveConflict() {
    if (!activeConflictDate) return;
    const c = conflictsByDate.get(activeConflictDate);
    if (c) onremoveconflict(c.id);
    activeConflictDate = null;
  }

  function editActiveConflict() {
    if (!activeConflictDate) return;
    const c = conflictsByDate.get(activeConflictDate);
    if (!c) return;
    editingConflict = c;
    editKind = c.startTime ? "timed" : "all-day";
    editStart = c.startTime ?? "";
    editEnd = c.endTime ?? "";
    editLabel = c.label ?? "";
    activeConflictDate = null;
  }

  function saveEditConflict() {
    if (!editingConflict) return;
    onremoveconflict(editingConflict.id);
    onaddconflict({
      id: `conf_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      actorId: member.id,
      date: editingConflict.date,
      label: editLabel.trim(),
      ...(editKind === "timed" && editStart && editEnd
        ? { startTime: editStart, endTime: editEnd }
        : {}),
    });
    editingConflict = null;
  }

  function submitPartial() {
    if (!partialDate || !partialStart || !partialEnd) return;
    onaddconflict({
      id: `conf_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      actorId: member.id,
      date: partialDate,
      label: partialLabel.trim(),
      startTime: partialStart,
      endTime: partialEnd,
    });
    partialDate = null;
  }

  function cancelPartial() {
    partialDate = null;
  }

  function handleKey(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      if (activeConflictDate) { activeConflictDate = null; return; }
      if (editingConflict) { editingConflict = null; return; }
      if (partialDate) { partialDate = null; return; }
      onclose();
    }
  }
</script>

<svelte:window onkeydown={handleKey} />

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="picker-backdrop" onclick={onclose}></div>

<div class="picker" role="dialog" aria-label="Conflicts for {member.firstName}">
  <header class="picker-header">
    <div>
      <div class="eyebrow">Conflicts for</div>
      <h3>
        <span class="name-dot" style:background={member.color}></span>
        {member.firstName} {member.lastName}
        {#if member.character}
          <span class="character-label">({member.character})</span>
        {/if}
      </h3>
    </div>
    <button type="button" class="close-btn" onclick={onclose} aria-label="Close">
      ×
    </button>
  </header>

  <p class="hint">
    Click to add a conflict. Shift+click for timed. Click a conflict to edit or remove.
    <strong>{conflictsByDate.size} conflict{conflictsByDate.size === 1 ? "" : "s"} total.</strong>
  </p>

  <div class="weekdays">
    {#each grid.weekdayHeaders as label (label)}
      <div class="weekday">{label}</div>
    {/each}
  </div>

  <div class="cal">
    {#each grid.rows as row, i (i)}
      {#if isWeekRow(row)}
        <div class="week-row">
          {#each row.cells as cell (cell.date)}
            {@const conflict = cell.inRange ? conflictsByDate.get(cell.date) : undefined}
            {@const showMonth = cell.dayOfMonth === 1 || cell.date === show.show.startDate}
            {#if cell.inRange}
              <button
                type="button"
                class="mini-cell"
                class:conflicted={!!conflict}
                class:active-cell={activeConflictDate === cell.date}
                title={conflict
                  ? `${cell.date} - conflicted (click for options)`
                  : cell.date}
                onclick={(e) => handleCellClick(cell.date, e.shiftKey)}
              >
                <span class="mini-num">{cell.dayOfMonth}</span>
                {#if showMonth}
                  <span class="mini-month">{["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][cell.month]}</span>
                {/if}
                {#if conflict?.startTime}
                  <span class="partial-dot"></span>
                {/if}
              </button>
            {:else}
              <div class="mini-cell placeholder" aria-hidden="true"></div>
            {/if}
          {/each}
        </div>
        {#if row.cells.some((c) => c.date === activeConflictDate)}
          {@const activeConflict = conflictsByDate.get(activeConflictDate!)}
          <div class="cell-actions-row">
            <span class="cell-actions-info">
              {#if activeConflict?.startTime}
                {formatTime(activeConflict.startTime, show.settings.timeFormat ?? "12h")} - {formatTime(activeConflict.endTime ?? "", show.settings.timeFormat ?? "12h")}
              {:else}
                Full day
              {/if}
              {#if activeConflict?.label}
                <span class="cell-actions-lbl">- {activeConflict.label}</span>
              {/if}
            </span>
            <button type="button" class="cell-action-btn cell-action-edit" onclick={editActiveConflict}>Edit</button>
            <button type="button" class="cell-action-btn cell-action-danger" onclick={removeActiveConflict}>Remove</button>
          </div>
        {/if}
      {/if}
    {/each}
  </div>

  {#if partialDate}
    <div class="partial-form">
      <h4>Partial conflict - {partialDate}</h4>
      <div class="partial-row">
        <div class="partial-field">
          <span>Start</span>
          <TimePicker
            value={partialStart}
            compact
            timeFormat={show.settings.timeFormat ?? "12h"}
            minuteStep={show.settings.timeIncrementMinutes ?? 15}
            onchange={(v) => (partialStart = v)}
          />
        </div>
        <div class="partial-field">
          <span>End</span>
          <TimePicker
            value={partialEnd}
            compact
            timeFormat={show.settings.timeFormat ?? "12h"}
            minuteStep={show.settings.timeIncrementMinutes ?? 15}
            minTime={partialStart}
            onchange={(v) => (partialEnd = v)}
          />
        </div>
      </div>
      <label class="partial-field">
        <span>Label (optional)</span>
        <input type="text" bind:value={partialLabel} placeholder="e.g. Doctor appt" />
      </label>
      <div class="partial-actions">
        <button type="button" onclick={cancelPartial}>Cancel</button>
        <button type="button" class="partial-submit" disabled={!partialStart || !partialEnd} onclick={submitPartial}>Add conflict</button>
      </div>
    </div>
  {/if}

  {#if editingConflict}
    <div class="partial-form">
      <h4>Edit conflict - {editingConflict.date}</h4>
      <div class="partial-row">
        <label><input type="radio" value="all-day" bind:group={editKind} /> Full day</label>
        <label><input type="radio" value="timed" bind:group={editKind} /> Timed</label>
      </div>
      {#if editKind === "timed"}
        <div class="partial-row">
          <div class="partial-field">
            <span>Start</span>
            <TimePicker value={editStart} compact timeFormat={show.settings.timeFormat ?? "12h"} minuteStep={show.settings.timeIncrementMinutes ?? 15} onchange={(v) => (editStart = v)} />
          </div>
          <div class="partial-field">
            <span>End</span>
            <TimePicker value={editEnd} compact timeFormat={show.settings.timeFormat ?? "12h"} minuteStep={show.settings.timeIncrementMinutes ?? 15} minTime={editStart} onchange={(v) => (editEnd = v)} />
          </div>
        </div>
      {/if}
      <label class="partial-field">
        <span>Label (optional)</span>
        <input type="text" bind:value={editLabel} placeholder="e.g. Doctor appt" />
      </label>
      <div class="partial-actions">
        <button type="button" onclick={() => (editingConflict = null)}>Cancel</button>
        <button type="button" class="partial-submit" onclick={saveEditConflict}>Save</button>
      </div>
    </div>
  {/if}
</div>


<style>
  .picker-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(45, 31, 61, 0.35);
    z-index: 140;
  }

  .picker {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 360px;
    max-width: calc(100vw - 2 * var(--space-4));
    max-height: calc(100vh - 2 * var(--space-4));
    background: var(--color-surface);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-lg);
    z-index: 150;
    display: flex;
    flex-direction: column;
    padding: var(--space-4);
    gap: var(--space-3);
    overflow: auto;
  }

  .picker-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-2);
  }

  .eyebrow {
    font-size: 0.625rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--color-text-subtle);
    font-weight: 700;
    margin-bottom: 2px;
  }

  .picker-header h3 {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin: 0;
    font-size: 1rem;
    color: var(--color-plum);
  }

  .name-dot {
    width: 10px;
    height: 10px;
    border-radius: var(--radius-full);
    flex-shrink: 0;
  }

  .character-label {
    font-weight: 400;
    color: var(--color-text-muted);
    font-size: 0.8125rem;
  }

  .close-btn {
    background: transparent;
    border: none;
    font-size: 1.25rem;
    cursor: pointer;
    color: var(--color-text-muted);
    line-height: 1;
    padding: 0 var(--space-1);
    border-radius: var(--radius-sm);
  }
  .close-btn:hover {
    color: var(--color-plum);
  }

  .hint {
    font-size: 0.6875rem;
    color: var(--color-text-muted);
    margin: 0;
  }

  .weekdays {
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
    gap: 2px;
  }

  .weekday {
    font-size: 0.5625rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--color-text-subtle);
    font-weight: 700;
    text-align: center;
    padding: 2px 0;
  }

  .cal {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding-bottom: var(--space-2);
  }

  .week-row {
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
    gap: 3px;
  }

  .mini-cell {
    aspect-ratio: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    font: inherit;
    font-size: 0.75rem;
    font-weight: 600;
    padding: 2px;
    background: var(--color-surface);
    color: var(--color-text);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: transform var(--transition-fast);
  }
  .mini-cell:hover:not(.placeholder) {
    transform: scale(1.05);
    border-color: var(--color-plum);
  }
  .mini-cell.conflicted {
    background: #fef3c7;
    border-color: #f59e0b;
    color: #92400e;
  }
  .mini-cell.active-cell {
    border-color: var(--color-teal);
    box-shadow: 0 0 0 1px var(--color-teal);
  }
  .mini-cell.placeholder {
    background: transparent;
    border-color: transparent;
    cursor: default;
    font-weight: 400;
  }

  .partial-dot {
    position: absolute;
    bottom: 2px;
    left: 50%;
    transform: translateX(-50%);
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: #f59e0b;
  }

  .mini-cell {
    position: relative;
  }

  .partial-form {
    padding: var(--space-3);
    border-top: 1px solid var(--color-border);
  }

  .partial-form h4 {
    font-size: 0.8125rem;
    font-weight: 600;
    margin: 0 0 var(--space-2);
    color: var(--color-plum);
  }

  .partial-row {
    display: flex;
    gap: var(--space-2);
    margin-bottom: var(--space-2);
  }

  .partial-field {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    flex: 1;
  }

  .partial-field span {
    font-size: 0.6875rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--color-text-muted);
  }

  .partial-field input {
    font: inherit;
    font-size: 0.8125rem;
    padding: var(--space-1) var(--space-2);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: var(--color-surface);
    color: var(--color-text);
  }

  .partial-field input:focus {
    outline: none;
    border-color: var(--color-teal);
  }

  .partial-actions {
    display: flex;
    gap: var(--space-2);
    justify-content: flex-end;
    margin-top: var(--space-2);
  }

  .partial-actions button {
    font: inherit;
    font-size: 0.8125rem;
    padding: var(--space-1) var(--space-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: transparent;
    cursor: pointer;
  }

  .partial-submit {
    background: var(--color-teal) !important;
    color: #fff !important;
    border-color: var(--color-teal) !important;
  }

  .partial-submit:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .mini-num {
    line-height: 1;
  }

  .mini-month {
    font-size: 0.5rem;
    font-weight: 500;
    color: var(--color-text-muted);
    line-height: 1;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .cell-actions-row {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    padding: var(--space-2) 0;
    background: var(--color-bg-alt, #f9fafb);
    border-radius: var(--radius-sm);
    margin: var(--space-1) 0;
  }

  .cell-actions-info {
    font-size: 0.6875rem;
    color: var(--color-text-muted);
    font-weight: 500;
  }

  .cell-actions-lbl {
    font-style: italic;
  }

  .cell-action-btn {
    font: inherit;
    font-size: 0.6875rem;
    font-weight: 600;
    padding: var(--space-1) var(--space-2);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: var(--color-surface);
    color: var(--color-text-muted);
    cursor: pointer;
  }

  .cell-action-edit:hover {
    border-color: var(--color-teal);
    color: var(--color-teal);
  }

  .cell-action-danger {
    color: var(--color-danger, #dc2626);
  }

  .cell-action-danger:hover {
    border-color: var(--color-danger, #dc2626);
    background: color-mix(in srgb, var(--color-danger, #dc2626) 8%, transparent);
  }
</style>
