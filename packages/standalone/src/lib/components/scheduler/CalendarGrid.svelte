<script lang="ts">
  /**
   * Renders a ScheduleDoc as a 7-column calendar grid. All date math is
   * delegated to core's `buildCalendarGrid`; this component owns layout and
   * row dispatch only.
   */
  import {
    buildCalendarGrid,
    holidayMap,
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
     *  filters. These are grayed out in addition to date-range
     *  filtering. */
    excludedDates?: Set<string>;
    inlineEdit?: InlineEditState | null;
    onstartinlineedit?: (date: IsoDate, field: InlineField, callId?: string) => void;
    oninlinechange?: (patch: Partial<ScheduleDay>) => void;
    oninlinecallchange?: (callId: string, patch: Partial<Call>) => void;
    oncommitinline?: () => void;
    oncancelinline?: () => void;
    /** When set, renders a single-day view (no weekday headers, just the one cell centered). */
    dayViewDate?: IsoDate;
  }

  const WEEKDAY_NAMES = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
  const MONTH_NAMES_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

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
    dayViewDate,
  }: Props = $props();

  const grid = $derived(
    buildCalendarGrid(show.show, {
      weekStartsOn: show.settings.weekStartsOn,
    }),
  );

  const holidays = $derived(
    holidayMap(
      show.show.startDate,
      show.show.endDate,
      show.settings.showUsHolidays ?? false,
      show.settings.customHolidays ?? [],
      show.settings.hiddenHolidays ?? [],
    ),
  );

  /**
   * When a date filter is active, keep only weeks that contain at least
   * one in-range cell within [filterStart, filterEnd]. Cells also need
   * to not be in the excludedDates set (from person/event/location
   * filters). We still show weeks that have AT LEAST one visible cell.
   */
  const filteredRows = $derived.by<CalendarRow[]>(() => {
    const hasRangeFilter = !!(filterStart || filterEnd);
    const hasExcluded = !!excludedDates && excludedDates.size > 0;
    if (!hasRangeFilter && !hasExcluded) return grid.rows;
    const lo = filterStart ?? show.show.startDate;
    const hi = filterEnd ?? show.show.endDate;
    return grid.rows.filter((row) => {
      if (!isWeekRow(row)) return false;
      return row.cells.some((c) => {
        if (!c.inRange) return false;
        if (hasRangeFilter && (c.date < lo || c.date > hi)) return false;
        if (hasExcluded && excludedDates!.has(c.date)) return false;
        return true;
      });
    });
  });
</script>

{#if dayViewDate}
  <!-- Day view: single cell centered with date header -->
  {@const dvCell = grid.rows.flatMap(r => isWeekRow(r) ? r.cells : []).find(c => c.date === dayViewDate)}
  {#if dvCell}
    {@const d = new Date(dayViewDate + "T00:00:00Z")}
    <div class="day-view">
      <div class="day-view-header">
        <span class="day-view-weekday">{WEEKDAY_NAMES[d.getUTCDay()]}</span>
        <span class="day-view-date">{MONTH_NAMES_LONG[d.getUTCMonth()]} {d.getUTCDate()}, {d.getUTCFullYear()}</span>
      </div>
      <div class="day-view-cell">
        <DayCell
          cell={dvCell}
          day={show.schedule[dvCell.date]}
          {show}
          selected={selectedDate === dvCell.date}
          rangeSelected={selectedDates.has(dvCell.date)}
          onselect={onselectday}
          {onremoveactor}
          {onremovecrew}
          {onremovegroup}
          {onremoveallcalled}
          {ondropactor}
          {ondropcrew}
          {ondropgroup}
          {ondropallcalled}
          {ondropeventtype}
          {ondroplocation}
          {ondropcall}
          {ondropnote}
          {onmoveactor}
          {onmovecrew}
          {onmovegroup}
          {onmoveallcalled}
          {onremoveeventtype}
          {onremovecall}
          {onremovenotes}
          {onremovedaylocation}
          inlineEdit={inlineEdit?.date === dvCell.date ? inlineEdit : null}
          {onstartinlineedit}
          {oninlinechange}
          {oninlinecallchange}
          {oncommitinline}
          {oncancelinline}
          holidayNames={holidays}
        />
      </div>
    </div>
  {/if}
{:else}
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
          {@const dateRangeOut = (filterStart || filterEnd) && (cell.date < filterLo || cell.date > filterHi)}
          {@const excludedOut = excludedDates?.has(cell.date) ?? false}
          {@const filteredOut = dateRangeOut || excludedOut}
          {@const effectiveCell = filteredOut ? { ...cell, inRange: false } : cell}
          <DayCell
            cell={effectiveCell}
            day={filteredOut ? undefined : show.schedule[cell.date]}
            {show}
            selected={selectedDate === cell.date}
            rangeSelected={selectedDates.has(cell.date)}
            onselect={onselectday}
            {onremoveactor}
            {onremovecrew}
            {onremovegroup}
            {onremoveallcalled}
            {ondropactor}
            {ondropcrew}
            {ondropgroup}
            {ondropallcalled}
            {ondropeventtype}
            {ondroplocation}
            {ondropcall}
            {ondropnote}
            {onmoveactor}
            {onmovecrew}
            {onmovegroup}
            {onmoveallcalled}
            {onremoveeventtype}
            {onremovecall}
            {onremovenotes}
            {onremovedaylocation}
            inlineEdit={inlineEdit?.date === cell.date ? inlineEdit : null}
            {onstartinlineedit}
            {oninlinechange}
            {oninlinecallchange}
            {oncommitinline}
            {oncancelinline}
            holidayNames={holidays}
          />
        {/each}
      </div>
    {/if}
  {/each}
</div>
{/if}

<style>
  .calendar {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    min-width: 0;
  }

  .day-view {
    display: flex;
    flex-direction: column;
    align-items: center;
    min-width: 0;
  }

  .day-view-header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    width: 100%;
    max-width: 600px;
    margin-bottom: var(--space-2);
  }

  .day-view-weekday {
    font-size: 0.8125rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--color-text-subtle);
  }

  .day-view-date {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--color-text-muted);
  }

  .day-view-cell {
    width: 100%;
    max-width: 600px;
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
