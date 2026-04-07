<script lang="ts">
  /**
   * Renders a ScheduleDoc as a 7-column calendar grid. All date math is
   * delegated to core's `buildCalendarGrid`; this component owns layout and
   * row dispatch only.
   */
  import {
    buildCalendarGrid,
    isMonthHeaderRow,
    isWeekRow,
    type IsoDate,
    type ScheduleDoc,
  } from "@rehearsal-block/core";
  import DayCell from "./DayCell.svelte";

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
  }: Props = $props();

  const grid = $derived(
    buildCalendarGrid(show.show, {
      weekStartsOn: show.settings.weekStartsOn,
    }),
  );
</script>

<div class="calendar">
  {#each grid.rows as row, i (i)}
    {#if isMonthHeaderRow(row)}
      <div class="month-header">
        <h3>{row.label}</h3>
        <div class="weekday-headers">
          {#each grid.weekdayHeaders as label (label)}
            <div class="weekday">{label}</div>
          {/each}
        </div>
      </div>
    {:else if isWeekRow(row)}
      <div class="week">
        {#each row.cells as cell (cell.date)}
          <DayCell
            {cell}
            day={show.schedule[cell.date]}
            {show}
            selected={selectedDate === cell.date}
            rangeSelected={selectedDates.has(cell.date)}
            onselect={onselectday}
            {onremoveactor}
            {onremovegroup}
            {onremoveallcalled}
            {ondropactor}
            {ondropgroup}
            {ondropallcalled}
          />
        {/each}
      </div>
    {/if}
  {/each}
</div>

<style>
  .calendar {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    min-width: 0;
  }

  .month-header h3 {
    font-family: var(--font-heading, var(--font-display));
    color: var(--color-plum);
    margin: var(--space-4) 0 var(--space-2);
    font-size: 1.25rem;
  }

  .weekday-headers,
  .week {
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
    gap: var(--space-2);
  }

  .weekday {
    font-size: 0.6875rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--color-text-subtle);
    font-weight: 700;
    padding: var(--space-1) var(--space-2);
    text-align: center;
  }
</style>
