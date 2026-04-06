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

  function toggleConflict(iso: IsoDate) {
    const existing = conflictsByDate.get(iso);
    if (existing) {
      onremoveconflict(existing.id);
    } else {
      onaddconflict({
        id: `conf_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        actorId: member.id,
        date: iso,
        label: "",
      });
    }
  }

  function handleKey(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
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
    Click a date to add or remove a full-day conflict.
    {conflictsByDate.size} conflict{conflictsByDate.size === 1 ? "" : "s"} total.
  </p>

  <div class="weekdays">
    {#each grid.weekdayHeaders as label (label)}
      <div class="weekday">{label}</div>
    {/each}
  </div>

  <div class="cal">
    {#each grid.rows as row, i (i)}
      {#if isMonthHeaderRow(row)}
        <div class="month-row">{row.label}</div>
      {:else if isWeekRow(row)}
        <div class="week-row">
          {#each row.cells as cell (cell.date)}
            {@const conflict = cell.inRange ? conflictsByDate.get(cell.date) : undefined}
            {#if cell.inRange}
              <button
                type="button"
                class="mini-cell"
                class:conflicted={!!conflict}
                title={conflict
                  ? `${cell.date} - conflicted (click to remove)`
                  : cell.date}
                onclick={() => toggleConflict(cell.date)}
              >
                {cell.dayOfMonth}
              </button>
            {:else}
              <div class="mini-cell placeholder" aria-hidden="true">
                {cell.dayOfMonth}
              </div>
            {/if}
          {/each}
        </div>
      {/if}
    {/each}
  </div>
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
  }

  .month-row {
    font-size: 0.6875rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    font-weight: 700;
    color: var(--color-plum);
    margin-top: var(--space-1);
    padding-left: var(--space-1);
  }

  .week-row {
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
    gap: 2px;
  }

  .mini-cell {
    aspect-ratio: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    font: inherit;
    font-size: 0.75rem;
    font-weight: 600;
    padding: 0;
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
    background: var(--color-warning-bg);
    border-color: var(--color-warning);
    color: var(--color-warning);
    font-weight: 800;
  }
  .mini-cell.placeholder {
    background: var(--color-bg-alt);
    color: var(--color-text-subtle);
    border-style: dashed;
    opacity: 0.4;
    cursor: default;
    font-weight: 400;
  }
</style>
