<script lang="ts">
  /**
   * Renders a ScheduleDoc as a 7-column calendar grid. All date math is
   * delegated to core's `buildCalendarGrid`; this component owns layout and
   * row dispatch only.
   */
  import {
    buildCalendarGrid,
    isWeekRow,
    type Call,
    type CalendarRow,
    type IsoDate,
    type ScheduleDay,
    type ScheduleDoc,
  } from "@rehearsal-block/core";
  import DayCell from "./DayCell.svelte";

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

  const grid = $derived(
    buildCalendarGrid(show.show, {
      weekStartsOn: show.settings.weekStartsOn,
    }),
  );

  /**
   * When a date filter is active, keep only weeks that contain at least
   * one in-range cell within [filterStart, filterEnd].
   */
  const filteredRows = $derived.by<CalendarRow[]>(() => {
    if (!filterStart && !filterEnd) return grid.rows;
    const lo = filterStart ?? show.show.startDate;
    const hi = filterEnd ?? show.show.endDate;
    return grid.rows.filter((row) => {
      if (!isWeekRow(row)) return false;
      return row.cells.some((c) => c.inRange && c.date >= lo && c.date <= hi);
    });
  });
</script>

<div class="calendar">
  <div class="weekday-headers">
    {#each grid.weekdayHeaders as label (label)}
      <div class="weekday">{label}</div>
    {/each}
  </div>
  {#each filteredRows as row, i (i)}
    {#if isWeekRow(row)}
      <div class="week">
        {#each row.cells as cell (cell.date)}
          {@const filterLo = filterStart ?? show.show.startDate}
          {@const filterHi = filterEnd ?? show.show.endDate}
          {@const filteredOut = (filterStart || filterEnd) && (cell.date < filterLo || cell.date > filterHi)}
          {@const effectiveCell = filteredOut ? { ...cell, inRange: false } : cell}
          <DayCell
            cell={effectiveCell}
            day={filteredOut ? undefined : show.schedule[cell.date]}
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
            inlineEdit={inlineEdit?.date === cell.date ? inlineEdit : null}
            {onstartinlineedit}
            {oninlinechange}
            {oninlinecallchange}
            {oncommitinline}
            {oncancelinline}
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

  .weekday-headers,
  .week {
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
    gap: var(--space-2);
  }

  .weekday-headers {
    position: sticky;
    top: var(--sticky-bar-height, 56px);
    z-index: 5;
    background: var(--color-bg, #fff);
    padding-bottom: var(--space-2);
    border-bottom: 1px solid var(--color-border);
    margin-bottom: var(--space-1);
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
