<script lang="ts">
  /**
   * Read-only schedule view. Decodes a ScheduleDoc from the URL hash
   * and renders a calendar grid with optional cast-member filtering.
   * No auth required - data is self-contained in the link.
   */
  import { browser } from "$app/environment";
  import { decodeSchedule } from "$lib/share";
  import type {
    ScheduleDoc,
    ScheduleDay,
    Call,
    EventType,
    IsoDate,
  } from "@rehearsal-block/core";
  import {
    buildCalendarGrid,
    isMonthHeaderRow,
    isWeekRow,
    castDisplayNames,
    expandCalledActorIds,
    effectiveDescription,
    effectiveLocation,
    locationColor,
    formatTime,
  } from "@rehearsal-block/core";

  let doc = $state<ScheduleDoc | null>(null);
  let error = $state("");
  let selectedActorId = $state<string | null>(null);

  // Load schedule from URL: either ?id=xxx (server-stored) or #d=xxx (hash-encoded)
  $effect(() => {
    if (!browser) return;

    const params = new URLSearchParams(window.location.search);
    const shareId = params.get("id");

    if (shareId) {
      // Fetch from server
      fetch(`/api/share?id=${encodeURIComponent(shareId)}`)
        .then((res) => {
          if (!res.ok) throw new Error("not found");
          return res.json();
        })
        .then((data) => {
          doc = data.doc;
        })
        .catch(() => {
          error = "Schedule not found. The link may have expired.";
        });
      return;
    }

    // Fallback: hash-encoded data
    const hash = window.location.hash;
    if (!hash || !hash.startsWith("#d=")) {
      error = "No schedule data in the link. Make sure you copied the full URL.";
      return;
    }
    const encoded = hash.slice(3);
    const result = decodeSchedule(encoded);
    if (!result) {
      error = "Could not load this schedule. The link may be incomplete or corrupted.";
      return;
    }
    doc = result;
  });

  const grid = $derived(
    doc
      ? buildCalendarGrid(doc.show, { weekStartsOn: doc.settings.weekStartsOn })
      : null,
  );

  const displayNames = $derived(
    doc ? castDisplayNames(doc.cast, doc.settings.castDisplayMode ?? "actor") : new Map(),
  );

  const timeFmt = $derived(doc?.settings.timeFormat ?? "12h");

  /** Set of ISO dates where the selected actor is called. */
  const calledDates = $derived.by(() => {
    if (!doc || !selectedActorId) return null; // null = no filter active
    const dates = new Set<string>();
    for (const [iso, day] of Object.entries(doc.schedule)) {
      for (const call of day.calls) {
        if (call.allCalled) {
          dates.add(iso);
          break;
        }
        const called = expandCalledActorIds(call, doc.groups);
        if (called.has(selectedActorId)) {
          dates.add(iso);
          break;
        }
      }
    }
    return dates;
  });

  function isCalled(iso: string): boolean | null {
    if (!calledDates) return null; // no filter
    return calledDates.has(iso);
  }

  /** Strip dangerous HTML from notes (user-generated rich text). */
  function sanitizeHtml(html: string): string {
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<iframe[\s\S]*?<\/iframe>/gi, "")
      .replace(/<object[\s\S]*?<\/object>/gi, "")
      .replace(/\son\w+\s*=/gi, " data-removed=");
  }

  function fmtTimeRange(call: Call): string {
    const start = formatTime(call.time, timeFmt);
    if (!start || start === "-") return "";
    if (call.endTime) return `${start} - ${formatTime(call.endTime, timeFmt)}`;
    return `${start}+`;
  }

  function formatDateLong(iso: string): string {
    const parts = iso.split("-").map(Number);
    const d = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
    return d.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    });
  }
</script>

<svelte:head>
  <title>{doc ? `${doc.show.name} - Schedule` : "View Schedule"} - Rehearsal Block</title>
  <link
    rel="stylesheet"
    href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Playfair+Display:wght@400;600;700&display=swap"
  />
</svelte:head>

{#if error}
  <div class="view-page">
    <div class="view-error">
      <h1>Can't load schedule</h1>
      <p>{error}</p>
    </div>
  </div>
{:else if !doc || !grid}
  <div class="view-page">
    <div class="view-loading">Loading schedule...</div>
  </div>
{:else}
  <div class="view-page">
    <header class="view-header">
      <div class="header-left">
        <h1>{doc.show.name}</h1>
        <span class="header-dates">
          {formatDateLong(doc.show.startDate)} - {formatDateLong(doc.show.endDate)}
        </span>
      </div>
      <div class="header-brand">
        <img src="/rehearsal-block-logo.svg" alt="Rehearsal Block" class="header-logo" />
      </div>
    </header>

    <div class="filter-bar">
      <label class="filter-label" for="cast-filter">Show schedule for</label>
      <select
        id="cast-filter"
        class="filter-select"
        value={selectedActorId ?? ""}
        onchange={(e) => {
          const val = e.currentTarget.value;
          selectedActorId = val || null;
        }}
      >
        <option value="">Everyone</option>
        {#each doc.cast as member (member.id)}
          <option value={member.id}>{displayNames.get(member.id) ?? member.firstName}</option>
        {/each}
      </select>
      {#if selectedActorId && calledDates}
        <span class="filter-count">
          {calledDates.size} day{calledDates.size === 1 ? "" : "s"} called
        </span>
      {/if}
    </div>

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
              {@const day = doc.schedule[cell.date]}
              {@const called = isCalled(cell.date)}
              {@const et = day ? doc.eventTypes.find((t) => t.id === day.eventTypeId) : undefined}
              {@const isDressPerf = et?.isDressPerf ?? false}
              {#if !cell.inRange}
                <div class="view-cell placeholder"></div>
              {:else}
                <div
                  class="view-cell"
                  class:has-content={!!day}
                  class:called={called === true}
                  class:uncalled={called === false}
                >
                  <div class="cell-header">
                    <span class="day-num">{cell.dayOfMonth}</span>
                    {#if day}
                      <div class="badge-group">
                        {#if day.secondaryTypeIds}
                          {#each day.secondaryTypeIds as sid (sid)}
                            {@const st = doc.eventTypes.find((t) => t.id === sid)}
                            {#if st}
                              <span
                                class="badge"
                                style:background={st.bgColor}
                                style:color={st.textColor}
                              >{st.name}</span>
                            {/if}
                          {/each}
                        {/if}
                        {#if et}
                          <span
                            class="badge"
                            style:background={et.bgColor}
                            style:color={et.textColor}
                          >{et.name}</span>
                        {/if}
                      </div>
                    {/if}
                  </div>

                  {#if day}
                    <!-- Curtain time for dress/perf -->
                    {#if isDressPerf && day.curtainTime}
                      <div class="curtain-time" style:color={et?.textColor ?? '#1a1a1a'}>
                        {formatTime(day.curtainTime, timeFmt)} CURTAIN
                      </div>
                    {/if}

                    {#if isDressPerf}
                      <!-- Dress/perf call lines -->
                      {#each day.calls as call (call.id)}
                        {#if call.time}
                          {@const suffix = call.suffix ?? "Call"}
                          {@const label = call.label ? `${call.label} ${suffix}` : suffix}
                          <div class="dp-call-line">
                            <span class="dp-label">{label}</span>
                            {formatTime(call.time, timeFmt)}
                          </div>
                        {/if}
                      {/each}
                      <!-- Chips for dress/perf -->
                      {#each day.calls as call (call.id)}
                        {#if call.allCalled}
                          <span class="all-called-chip">All Called</span>
                        {:else}
                          {#each call.calledGroupIds as gid (gid)}
                            {@const g = doc.groups.find((x) => x.id === gid)}
                            {#if g}
                              <span class="group-chip" style:background={g.color ?? '#6a1b9a'}>
                                {g.name}
                              </span>
                            {/if}
                          {/each}
                        {/if}
                      {/each}
                    {:else}
                      <!-- Normal rehearsal calls -->
                      {#each day.calls as call, ci (call.id)}
                        {@const hasContent =
                          call.allCalled ||
                          call.calledActorIds.length > 0 ||
                          call.calledGroupIds.length > 0 ||
                          (call.description ?? "").trim() !== "" ||
                          (day.description ?? "").trim() !== ""}
                        {#if hasContent}
                          {@const tr = fmtTimeRange(call)}
                          {@const loc = effectiveLocation(day, call).trim()}
                          {@const locColor = loc ? locationColor(loc) : null}
                          {@const desc = effectiveDescription(day, call).trim()}
                          <div class="call-block" class:call-border={ci > 0}>
                            {#if tr}
                              <div class="call-time" style:color={locColor}>{tr}</div>
                            {/if}
                            {#if desc}
                              <div class="call-desc">{desc}</div>
                            {/if}

                            <!-- Called chips -->
                            {#if call.allCalled}
                              <span class="all-called-chip">All Called</span>
                            {:else}
                              {#each call.calledGroupIds as gid (gid)}
                                {@const g = doc.groups.find((x) => x.id === gid)}
                                {#if g}
                                  <span class="group-chip" style:background={g.color ?? '#6a1b9a'}>
                                    {g.name}
                                  </span>
                                {/if}
                              {/each}
                              {#each call.calledActorIds as aid (aid)}
                                {@const member = doc?.cast.find((m) => m.id === aid)}
                                {#if member}
                                  {@const covered = call.calledGroupIds.some((gid) => {
                                    const g = doc?.groups.find((x) => x.id === gid);
                                    return g?.memberIds.includes(aid) ?? false;
                                  })}
                                  {#if !covered}
                                    <span class="actor-chip">
                                      <span class="chip-dot" style:background={member.color}></span>
                                      {displayNames.get(aid) ?? member.firstName}
                                    </span>
                                  {/if}
                                {/if}
                              {/each}
                            {/if}
                          </div>
                        {/if}
                      {/each}
                    {/if}

                    <!-- Notes -->
                    {#if day.notes && day.notes.replace(/<[^>]*>/g, "").trim()}
                      <div class="cell-notes">
                        {@html sanitizeHtml(day.notes)}
                      </div>
                    {/if}

                    <!-- Location footer -->
                    {@const locations = (() => {
                      const s = new Set<string>();
                      if (isDressPerf && day.location) {
                        s.add(day.location);
                      } else {
                        for (const c of day.calls) {
                          const loc = effectiveLocation(day, c).trim();
                          if (loc) s.add(loc);
                        }
                      }
                      return [...s];
                    })()}
                    {#if locations.length > 0}
                      <div class="location-footer">
                        {#each locations as loc (loc)}
                          {@const color = locationColor(loc)}
                          <span class="loc-pill" style:color={color}>
                            {loc}
                          </span>
                        {/each}
                      </div>
                    {/if}
                  {/if}
                </div>
              {/if}
            {/each}
          </div>
        {/if}
      {/each}
    </div>

    <footer class="view-footer">
      <span class="footer-brand">Shared from Rehearsal Block</span>
    </footer>
  </div>
{/if}

<style>
  .view-page {
    max-width: 1400px;
    margin: 0 auto;
    padding: var(--space-4) var(--space-5);
    font-family: "Inter", system-ui, sans-serif;
  }

  /* ---- Header ---- */
  .view-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    padding-bottom: var(--space-4);
    border-bottom: 3px solid var(--color-teal);
    margin-bottom: var(--space-4);
    gap: var(--space-4);
  }

  .view-header h1 {
    font-family: "Playfair Display", Georgia, serif;
    font-size: 1.75rem;
    color: var(--color-plum);
    margin: 0;
  }

  .header-dates {
    font-size: 0.875rem;
    color: var(--color-text-muted);
  }

  .header-logo {
    height: 36px;
    width: auto;
    opacity: 0.3;
  }

  /* ---- Filter bar ---- */
  .filter-bar {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-4);
    background: var(--color-bg-alt);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    margin-bottom: var(--space-4);
    position: sticky;
    top: 0;
    z-index: 10;
  }

  .filter-label {
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--color-text);
    white-space: nowrap;
  }

  .filter-select {
    font: inherit;
    font-size: 0.875rem;
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--color-border-strong);
    border-radius: var(--radius-sm);
    background: var(--color-surface);
    color: var(--color-text);
    min-width: 180px;
    cursor: pointer;
  }
  .filter-select:focus {
    outline: 2px solid var(--color-teal);
    outline-offset: 0;
    border-color: var(--color-teal);
  }

  .filter-count {
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--color-teal);
  }

  /* ---- Calendar grid ---- */
  .calendar {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .month-header h3 {
    font-family: "Playfair Display", Georgia, serif;
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

  /* ---- Day cells ---- */
  .view-cell {
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    padding: var(--space-2) var(--space-2);
    min-height: 90px;
    overflow: hidden;
    font-size: 0.75rem;
    transition: opacity 0.2s, border-color 0.2s;
  }

  .view-cell.placeholder {
    background: var(--color-bg-alt);
    border-style: dashed;
    border-color: var(--color-border);
    opacity: 0.3;
  }

  .view-cell.called {
    border-left: 3px solid var(--color-teal);
    background: rgba(56, 129, 125, 0.04);
  }

  .view-cell.uncalled {
    opacity: 0.25;
  }

  .cell-header {
    display: flex;
    align-items: flex-start;
    gap: 3px;
    margin-bottom: 3px;
  }

  .day-num {
    font-weight: 700;
    font-size: 0.8125rem;
    color: var(--color-plum);
    flex-shrink: 0;
  }

  .badge-group {
    display: flex;
    flex-wrap: wrap;
    gap: 2px;
    flex: 1;
    direction: rtl;
  }
  .badge-group .badge { direction: ltr; }

  .badge {
    display: inline-block;
    padding: 1px 6px;
    border-radius: 3px;
    font-size: 0.5625rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    white-space: nowrap;
  }

  .curtain-time {
    font-size: 0.6875rem;
    font-weight: 700;
    margin-bottom: 2px;
  }

  /* ---- Call blocks ---- */
  .call-block {
    margin-top: 3px;
    padding-top: 2px;
  }
  .call-border {
    border-top: 1px dashed var(--color-border);
  }

  .call-time {
    font-size: 0.6875rem;
    font-weight: 700;
  }

  .call-desc {
    font-size: 0.6875rem;
    color: var(--color-text-muted);
  }

  .dp-call-line {
    font-size: 0.6875rem;
    margin-top: 2px;
  }
  .dp-label {
    font-weight: 700;
  }

  /* ---- Chips ---- */
  .all-called-chip {
    display: inline-block;
    padding: 1px 5px;
    border-radius: 3px;
    font-size: 0.5625rem;
    font-weight: 700;
    color: #fff;
    background: #5b1a2b;
    margin: 1px 1px 0 0;
  }

  .group-chip {
    display: inline-block;
    padding: 1px 5px;
    border-radius: 3px;
    font-size: 0.5625rem;
    font-weight: 700;
    color: #fff;
    margin: 1px 1px 0 0;
  }

  .actor-chip {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    padding: 1px 4px;
    border: 1px solid var(--color-border);
    border-radius: 2px;
    font-size: 0.5625rem;
    font-weight: 600;
    margin: 1px 1px 0 0;
  }

  .chip-dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  /* ---- Notes ---- */
  .cell-notes {
    font-size: 0.6875rem;
    color: var(--color-text-muted);
    font-style: italic;
    margin-top: 3px;
  }
  .cell-notes :global(p) { margin: 0; display: inline; }
  .cell-notes :global(strong) { font-weight: 700; font-style: normal; }

  /* ---- Location ---- */
  .location-footer {
    margin-top: 3px;
    padding-top: 2px;
    border-top: 1px solid var(--color-border);
    font-size: 0.625rem;
    font-weight: 700;
  }
  .loc-pill::before { content: "\25A0 "; }

  /* ---- Footer ---- */
  .view-footer {
    margin-top: var(--space-6);
    padding-top: var(--space-4);
    border-top: 1px solid var(--color-border);
    text-align: center;
  }

  .footer-brand {
    font-size: 0.75rem;
    color: var(--color-text-subtle);
  }

  /* ---- Error / loading ---- */
  .view-error, .view-loading {
    text-align: center;
    padding: var(--space-8) var(--space-4);
  }

  .view-error h1 {
    font-family: "Playfair Display", Georgia, serif;
    color: var(--color-plum);
    font-size: 1.5rem;
    margin-bottom: var(--space-3);
  }

  .view-error p {
    color: var(--color-text-muted);
    font-size: 1rem;
  }

  .view-loading {
    color: var(--color-text-subtle);
    font-size: 1rem;
  }

  /* ---- Mobile ---- */
  @media (max-width: 768px) {
    .view-page {
      padding: var(--space-3);
    }

    .view-header {
      flex-direction: column;
      gap: var(--space-2);
    }

    .view-header h1 { font-size: 1.25rem; }
    .header-logo { height: 28px; }

    .filter-bar {
      flex-wrap: wrap;
    }

    .view-cell {
      min-height: 70px;
      padding: 3px;
      font-size: 0.6875rem;
    }
  }

  @media (max-width: 480px) {
    .weekday-headers,
    .week {
      grid-template-columns: 1fr;
      gap: var(--space-1);
    }

    .view-cell.placeholder {
      display: none;
    }

    .view-cell {
      min-height: auto;
      padding: var(--space-2) var(--space-3);
    }

    .day-num::after {
      content: " -";
      font-weight: 400;
      color: var(--color-text-subtle);
    }
  }
</style>
