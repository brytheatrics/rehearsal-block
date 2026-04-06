<script lang="ts">
  /**
   * Compact calendar popover for bulk-assigning an event type to dates.
   *
   * Use case: "the last 4 days before opening are all Dress Rehearsal, the
   * final 6 are Performances". Rather than click each day, open the event
   * type's mini calendar and click those dates directly.
   *
   * Every date's current event type (from any type, not just the active
   * one) is shown in its own badge colors, so when a director opens
   * Performance's picker they can still see where Dress Rehearsal already
   * landed and not double-book.
   *
   * Click a date → assign the active type (parent handles create-or-update).
   * Click an already-this-type date → no-op; user can reassign via another
   * type's picker.
   */
  import type { EventType, IsoDate, ScheduleDoc } from "@rehearsal-block/core";
  import {
    buildCalendarGrid,
    isMonthHeaderRow,
    isWeekRow,
  } from "@rehearsal-block/core";

  interface Props {
    show: ScheduleDoc;
    activeType: EventType;
    onassign: (iso: IsoDate) => void;
    onclose: () => void;
  }

  const { show, activeType, onassign, onclose }: Props = $props();

  const grid = $derived(
    buildCalendarGrid(show.show, {
      weekStartsOn: show.settings.weekStartsOn,
    }),
  );

  function typeForDate(iso: IsoDate): EventType | null {
    const day = show.schedule[iso];
    if (!day) return null;
    return show.eventTypes.find((t) => t.id === day.eventTypeId) ?? null;
  }

  /**
   * Is this date owned by the defaults flow (assigned via a mini-cal
   * click) vs merely edited into existence via the day editor's pill
   * row? Defaults-owned dates render full color; editor-owned dates
   * render lighter so directors see at a glance which ones clicking
   * Clear in the editor would wipe.
   */
  function isDefaultsOwned(iso: IsoDate): boolean {
    return show.settings.defaultsAssignedDates?.includes(iso) ?? false;
  }

  function handleKey(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      onclose();
    }
  }
</script>

<svelte:window onkeydown={handleKey} />

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="mini-backdrop" onclick={onclose}></div>

<div class="mini-popover" role="dialog" aria-label="Assign event type to dates">
  <header class="mini-header">
    <div>
      <div class="eyebrow">Assign days to</div>
      <span
        class="header-badge"
        style:background={activeType.bgColor}
        style:color={activeType.textColor}
      >
        {activeType.name}
      </span>
    </div>
    <button type="button" class="close-btn" onclick={onclose} aria-label="Close">
      ×
    </button>
  </header>

  <p class="hint">
    Click any date to tag it as <strong>{activeType.name}</strong>; click
    again to clear it. Dates already tagged as other event types show in
    their own colors so you don't double-book.
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
            {@const assigned = cell.inRange ? typeForDate(cell.date) : null}
            {@const defaultsOwned =
              cell.inRange ? isDefaultsOwned(cell.date) : false}
            {@const isActive =
              defaultsOwned && assigned?.id === activeType.id}
            {#if cell.inRange}
              <button
                type="button"
                class="mini-cell"
                class:active={isActive}
                class:assigned={!!assigned && defaultsOwned}
                class:soft-assigned={!!assigned && !defaultsOwned}
                style:--cell-bg={assigned?.bgColor ?? "var(--color-surface)"}
                style:--cell-fg={assigned?.textColor ?? "var(--color-text)"}
                title={assigned
                  ? defaultsOwned
                    ? `${cell.date} - ${assigned.name}`
                    : `${cell.date} - ${assigned.name} (from editor, click to assign to defaults)`
                  : cell.date}
                onclick={() => onassign(cell.date)}
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
  .mini-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(45, 31, 61, 0.35);
    z-index: 140;
  }

  .mini-popover {
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

  .mini-header {
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

  .header-badge {
    display: inline-block;
    padding: 2px var(--space-2);
    border-radius: var(--radius-sm);
    font-size: 0.75rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
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
    line-height: 1.4;
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
    background: var(--cell-bg);
    color: var(--cell-fg);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition:
      transform var(--transition-fast),
      box-shadow var(--transition-fast);
  }
  .mini-cell:hover:not(.placeholder) {
    transform: scale(1.05);
    z-index: 1;
    border-color: var(--color-plum);
  }
  .mini-cell.assigned {
    border-color: var(--cell-fg);
  }
  /* Editor-owned days render lighter so the director can tell at a
     glance that they're shown for context only - the days aren't part
     of the defaults set, and Clear in the editor would wipe them. */
  .mini-cell.soft-assigned {
    opacity: 0.45;
    border-style: dashed;
    border-color: var(--cell-fg);
  }
  .mini-cell.soft-assigned:hover {
    opacity: 0.75;
  }
  .mini-cell.active {
    box-shadow: 0 0 0 2px var(--cell-bg), 0 0 0 3px var(--cell-fg);
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
