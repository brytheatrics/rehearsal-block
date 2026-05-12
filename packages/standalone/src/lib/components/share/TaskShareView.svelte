<script lang="ts">
  /**
   * Carpenter-facing share view for a Task Schedule.
   *
   * The doc itself is fetched once by the parent /(view)/view page from
   * R2 (immutable from this view's perspective). Carpenter check state
   * lives in a separate /api/task-check overlay - polled every 15s,
   * merged with the doc here, and posted back per-toggle. That keeps
   * the doc save loop and the carpenter check loop from fighting and
   * lets multiple carpenters toggle the same day without clobbering
   * each other.
   *
   * On first interaction we ask for the carpenter's name (stored in
   * localStorage so they only see the prompt once per device). The
   * name rides along with each POST so Blake can see "Mike checked
   * the deck framing at 2pm" in the underlying record. Trust-based -
   * the carpenter could type anything, but among a known shop crew
   * that's fine.
   */
  import { onMount } from "svelte";
  import { browser } from "$app/environment";
  import type { ScheduleDoc, IsoDate, Task, ScheduleDay } from "@rehearsal-block/core";
  import CalendarGrid from "$lib/components/scheduler/CalendarGrid.svelte";
  import ListView from "$lib/components/scheduler/ListView.svelte";
  import TaskScheduleSidebar from "$lib/components/scheduler/TaskScheduleSidebar.svelte";

  interface Props {
    doc: ScheduleDoc;
    shareId: string;
  }

  const { doc: initialDoc, shareId }: Props = $props();

  /* Local mutable copy of the doc so we can re-poll the share blob
     and pick up Blake's edits (new tasks, edited text, new uploaded
     drawings, etc.). The parent /view route fetched the doc once on
     mount; without this, carpenters would have to reload the page to
     see anything Blake adds after they first opened the link. */
  let liveDoc = $state<ScheduleDoc>(initialDoc);

  type CheckState = { done: boolean; doneBy: string | null; doneAt: string | null };

  /* Authoritative carpenter check overlay. Populated from
     /api/task-check on mount + every 15s. Optimistic local toggles
     also write here for instant UI feedback. */
  let checks = $state<Record<string, CheckState>>({});

  /* The merged doc rendered to the calendar/list/sidebar. Each task's
     done / doneBy / doneAt is taken from `checks` if present, else
     from the original doc - so day cells show the carpenter-driven
     state without mutating the immutable doc. */
  const viewDoc = $derived.by<ScheduleDoc>(() => {
    const overlay = (t: Task): Task => {
      const c = checks[t.id];
      if (!c) return t;
      if (c.done) {
        return { ...t, done: true, doneBy: c.doneBy ?? undefined, doneAt: c.doneAt ?? undefined };
      }
      const { doneAt: _da, doneBy: _db, ...rest } = t;
      return { ...rest, done: false };
    };
    const nextSchedule: typeof liveDoc.schedule = {};
    for (const [iso, day] of Object.entries(liveDoc.schedule)) {
      if (!day) continue;
      if (!day.tasks || day.tasks.length === 0) {
        nextSchedule[iso] = day;
        continue;
      }
      nextSchedule[iso] = { ...day, tasks: day.tasks.map(overlay) };
    }
    return {
      ...liveDoc,
      schedule: nextSchedule,
      backlog: liveDoc.backlog ? liveDoc.backlog.map(overlay) : liveDoc.backlog,
    };
  });

  /* Carpenter name + first-time prompt state. Persisted in
     localStorage under "rb-carpenter-name" so each device only sees
     the prompt once. Empty string means "not set yet". */
  const STORAGE_KEY = "rb-carpenter-name";
  let carpenterName = $state("");
  let nameModalOpen = $state(false);
  let nameInputValue = $state("");

  onMount(() => {
    if (!browser) return;
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored && stored.trim()) {
      carpenterName = stored.trim();
    } else {
      nameInputValue = "";
      nameModalOpen = true;
    }
    fetchChecks();
    const checksInterval = setInterval(fetchChecks, 15_000);

    /* Re-poll the doc itself every 30s so new tasks, edited text,
       and freshly uploaded files Blake adds in the editor flow to
       carpenters without making them refresh. The doc payload is
       small (gzipped JSON, KB range), so this is cheap. */
    const docInterval = setInterval(fetchDoc, 30_000);

    return () => {
      clearInterval(checksInterval);
      clearInterval(docInterval);
    };
  });

  async function fetchDoc() {
    try {
      const res = await fetch(`/api/share?id=${encodeURIComponent(shareId)}`);
      if (!res.ok) return;
      const body = await res.json();
      if (body.doc) liveDoc = body.doc;
    } catch {
      /* network glitch - next poll retries */
    }
  }

  function commitName() {
    const trimmed = nameInputValue.trim();
    if (!trimmed) return;
    carpenterName = trimmed;
    if (browser) window.localStorage.setItem(STORAGE_KEY, trimmed);
    nameModalOpen = false;
  }

  async function fetchChecks() {
    try {
      const res = await fetch(`/api/task-check?shareId=${encodeURIComponent(shareId)}`);
      if (!res.ok) return;
      const body = await res.json();
      const next: Record<string, CheckState> = {};
      for (const row of body.checks ?? []) {
        next[row.task_id] = {
          done: !!row.done,
          doneBy: row.done_by ?? null,
          doneAt: row.done_at ?? null,
        };
      }
      checks = next;
    } catch {
      /* network error - keep showing the last-known checks rather
         than reverting everything. Next poll will retry. */
    }
  }

  function findTaskState(taskId: string): { done: boolean } | null {
    if (checks[taskId]) return { done: checks[taskId].done };
    for (const day of Object.values(liveDoc.schedule)) {
      const t = day?.tasks?.find((x) => x.id === taskId);
      if (t) return { done: t.done };
    }
    const bt = liveDoc.backlog?.find((x) => x.id === taskId);
    if (bt) return { done: bt.done };
    return null;
  }

  /**
   * Click handler for any task checkbox in the share view (cell, list,
   * or completed-uncheck). Optimistic-updates the local checks map and
   * POSTs to /api/task-check. On failure, reverts the optimistic
   * change so the UI doesn't lie about the persisted state.
   *
   * `where` is unused in the share view - the shape matches the
   * existing TaskScheduleSidebar.ontoggletask signature so we can
   * reuse the component as-is.
   */
  async function toggleTask(_where: string | "backlog", taskId: string) {
    if (!carpenterName) {
      nameInputValue = "";
      nameModalOpen = true;
      return;
    }
    const cur = findTaskState(taskId);
    if (!cur) return;
    const willBeDone = !cur.done;
    const newState: CheckState = willBeDone
      ? { done: true, doneBy: carpenterName, doneAt: new Date().toISOString() }
      : { done: false, doneBy: null, doneAt: null };
    const prev = checks[taskId] ?? null;
    checks = { ...checks, [taskId]: newState };

    try {
      const res = await fetch("/api/task-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shareId,
          taskId,
          done: willBeDone,
          doneBy: willBeDone ? carpenterName : null,
        }),
      });
      if (!res.ok) throw new Error("save failed");
    } catch {
      const reverted = { ...checks };
      if (prev) reverted[taskId] = prev;
      else delete reverted[taskId];
      checks = reverted;
    }
  }

  /* Day-cell wrapper that wraps the cell-level (date, taskId) signature
     down to the share view's "where" version. */
  function toggleTaskOnDay(date: IsoDate, taskId: string) {
    toggleTask(date, taskId);
  }

  /**
   * Carpenter writes flow through /api/share-mutate, which fetches
   * the current R2 doc, applies the operation, and writes back.
   * Server-side merge avoids racing two carpenters' clicks.
   *
   * We update liveDoc optimistically so the UI feels instant; the
   * next 30s doc poll will reconcile if the server-side result
   * differs (rare).
   */
  async function carpenterAddBacklog(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    if (!carpenterName) {
      nameInputValue = "";
      nameModalOpen = true;
      return;
    }
    /* Optimistic local insert with a placeholder id; the server
       will assign the real id, but liveDoc gets replaced on the
       next poll so divergence is short-lived. */
    const placeholderId = `task_pending_${Date.now()}`;
    liveDoc = {
      ...liveDoc,
      backlog: [...(liveDoc.backlog ?? []), { id: placeholderId, text: trimmed, done: false }],
    };
    try {
      await fetch("/api/share-mutate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shareId,
          action: "addBacklog",
          payload: { text: trimmed },
          addedBy: carpenterName,
        }),
      });
      /* Force a doc refresh so the placeholder id is replaced with
         the real one. Without this the carpenter sees a duplicate
         row until the next 30s poll fires. */
      fetchDoc();
    } catch {
      /* revert optimistic */
      liveDoc = {
        ...liveDoc,
        backlog: (liveDoc.backlog ?? []).filter((t) => t.id !== placeholderId),
      };
    }
  }

  async function carpenterMoveToToday(taskId: string) {
    const today = todayIso();
    const task = liveDoc.backlog?.find((t) => t.id === taskId);
    if (!task) return;
    /* Optimistic local move. */
    const next = { ...liveDoc };
    next.backlog = (next.backlog ?? []).filter((t) => t.id !== taskId);
    const existing = next.schedule[today];
    const baseDay = existing ?? {
      eventTypeId: "",
      calls: [],
      description: "",
      notes: "",
      location: "",
    };
    next.schedule = {
      ...next.schedule,
      [today]: { ...baseDay, tasks: [...(baseDay.tasks ?? []), task] },
    };
    liveDoc = next;
    try {
      await fetch("/api/share-mutate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shareId,
          action: "moveToToday",
          payload: { taskId, todayIso: today },
          addedBy: carpenterName,
        }),
      });
    } catch {
      /* revert optimistic on failure */
      fetchDoc();
    }
  }

  /* ---- Filter + view mode ---- */

  type Filter = "today" | "week" | "upcoming" | "all";
  let filter = $state<Filter>("all");
  let viewMode = $state<"calendar" | "list">("calendar");

  /* Mobile breakpoint follows the rest of the app's @media (max-width: 768px).
     On phones, default to list + this-week per Blake's spec. */
  let isPhoneWidth = $state(false);
  onMount(() => {
    if (!browser) return;
    const mq = window.matchMedia("(max-width: 768px)");
    const apply = () => {
      isPhoneWidth = mq.matches;
      if (mq.matches) {
        viewMode = "list";
        filter = "week";
      } else {
        viewMode = "calendar";
        filter = "all";
      }
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  });

  function todayIso(): IsoDate {
    return new Date().toISOString().slice(0, 10) as IsoDate;
  }

  function addDaysIso(iso: IsoDate, days: number): IsoDate {
    const d = new Date(iso + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10) as IsoDate;
  }

  /* Filter window as [startIso, endIso]. The CalendarGrid + ListView
     already accept filterStart/filterEnd so we lean on that. */
  const filterRange = $derived.by<{ start: IsoDate; end: IsoDate } | null>(() => {
    const today = todayIso();
    if (filter === "today") return { start: today, end: today };
    if (filter === "upcoming") return { start: today, end: liveDoc.show.endDate as IsoDate };
    if (filter === "week") {
      // 7-day window starting today (carpenter-friendly "what's this week").
      return { start: today, end: addDaysIso(today, 6) };
    }
    return null;
  });

  /* ---- Visible-task aware filter for the sidebar overlay. The
     TaskScheduleSidebar reads doc.backlog + doc.schedule directly so
     filter doesn't restrict it (carpenters always see the full
     backlog and the full Completed list - those are reference info,
     not "what's on this week's schedule"). */
</script>

<svelte:head>
  <title>{liveDoc.show.name} - Tasks</title>
</svelte:head>

<div class="task-share-page" class:phone={isPhoneWidth}>
  <header class="task-share-header">
    <div class="header-left">
      <h1>{liveDoc.show.name}</h1>
      {#if carpenterName}
        <span class="carpenter-name">
          Hi, {carpenterName}.
          <button
            type="button"
            class="change-name-link"
            onclick={() => { nameInputValue = carpenterName; nameModalOpen = true; }}
          >Not you?</button>
        </span>
      {/if}
    </div>
    <div class="header-controls">
      <select
        class="filter-select"
        value={filter}
        onchange={(e) => (filter = e.currentTarget.value as Filter)}
        aria-label="Filter days"
      >
        <option value="today">Today</option>
        <option value="week">This week</option>
        <option value="upcoming">Upcoming</option>
        <option value="all">All</option>
      </select>
      <div class="view-toggle" role="group" aria-label="View mode">
        <button
          type="button"
          class="view-toggle-btn"
          class:active={viewMode === "calendar"}
          aria-pressed={viewMode === "calendar"}
          onclick={() => (viewMode = "calendar")}
        >Calendar</button>
        <button
          type="button"
          class="view-toggle-btn"
          class:active={viewMode === "list"}
          aria-pressed={viewMode === "list"}
          onclick={() => (viewMode = "list")}
        >List</button>
      </div>
    </div>
  </header>

  <div class="task-share-body">
    <aside class="task-share-sidebar">
      <TaskScheduleSidebar
        show={viewDoc}
        readOnly={true}
        ontoggletask={toggleTask}
        oncarpenteraddbacklog={carpenterAddBacklog}
        oncarpentermovetotoday={carpenterMoveToToday}
        sectionsExpandedByDefault={!isPhoneWidth}
      />
    </aside>
    <main class="task-share-main">
      {#if viewMode === "calendar"}
        <CalendarGrid
          show={viewDoc}
          selectedDate={null}
          onselectday={() => { /* no-op: carpenters can't open the editor */ }}
          ontoggletask={toggleTaskOnDay}
          filterStart={filterRange?.start}
          filterEnd={filterRange?.end}
        />
      {:else}
        <ListView
          show={viewDoc}
          selectedDate={null}
          onselectday={() => {}}
          ontoggletask={toggleTaskOnDay}
          filterStart={filterRange?.start}
          filterEnd={filterRange?.end}
        />
      {/if}
    </main>
  </div>
</div>

{#if nameModalOpen}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="name-backdrop" onclick={() => carpenterName && (nameModalOpen = false)}></div>
  <div class="name-modal" role="dialog" aria-modal="true" aria-labelledby="name-modal-title">
    <h2 id="name-modal-title">Who are you?</h2>
    <p>So Blake can see who checked off what. Just your first name is fine.</p>
    <input
      type="text"
      class="name-input"
      placeholder="Frank"
      value={nameInputValue}
      oninput={(e) => (nameInputValue = e.currentTarget.value)}
      onkeydown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commitName();
        }
      }}
    />
    <div class="name-actions">
      {#if carpenterName}
        <button
          type="button"
          class="name-cancel"
          onclick={() => (nameModalOpen = false)}
        >Cancel</button>
      {/if}
      <button
        type="button"
        class="name-confirm"
        disabled={!nameInputValue.trim()}
        onclick={commitName}
      >Save</button>
    </div>
  </div>
{/if}

<style>
  .task-share-page {
    min-height: 100vh;
    background: var(--color-bg);
    color: var(--color-text);
    font-family: var(--font-main, system-ui, sans-serif);
    padding: var(--space-4);
  }

  .task-share-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    flex-wrap: wrap;
    margin-bottom: var(--space-4);
    padding-bottom: var(--space-3);
    border-bottom: 1px solid var(--color-border);
  }
  .header-left {
    display: flex;
    align-items: baseline;
    gap: var(--space-3);
    flex-wrap: wrap;
  }
  .header-left h1 {
    margin: 0;
    font-family: var(--font-heading, var(--font-display));
    color: var(--color-plum);
    font-size: 1.5rem;
  }
  .carpenter-name {
    font-size: 0.8125rem;
    color: var(--color-text-muted);
  }
  .change-name-link {
    font: inherit;
    font-size: 0.75rem;
    background: none;
    border: none;
    color: var(--color-teal);
    cursor: pointer;
    padding: 0;
    margin-left: var(--space-1);
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  .header-controls {
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }

  .filter-select {
    font: inherit;
    font-size: 0.875rem;
    padding: var(--space-1) var(--space-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: var(--color-surface);
    color: var(--color-text);
    cursor: pointer;
  }

  .view-toggle {
    display: inline-flex;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    overflow: hidden;
  }
  .view-toggle-btn {
    font: inherit;
    font-size: 0.8125rem;
    padding: var(--space-1) var(--space-3);
    border: none;
    background: var(--color-surface);
    color: var(--color-text-muted);
    cursor: pointer;
  }
  .view-toggle-btn.active {
    background: var(--color-plum);
    color: var(--color-text-inverse);
  }

  .task-share-body {
    display: grid;
    grid-template-columns: minmax(220px, 260px) minmax(0, 1fr);
    gap: var(--space-4);
    align-items: start;
  }
  .task-share-sidebar {
    position: sticky;
    top: var(--space-4);
    max-height: calc(100vh - var(--space-8));
    overflow-y: auto;
  }
  .task-share-main {
    min-width: 0;
  }

  @media (max-width: 768px) {
    .task-share-body {
      grid-template-columns: 1fr;
    }
    .task-share-sidebar {
      position: static;
      max-height: none;
      /* Above the list view on mobile so carpenters can see (and
         expand) Backlog / Completed / Uploads without scrolling
         past the day list. Sections default to collapsed on mobile. */
      order: 1;
    }
    .task-share-main {
      order: 2;
    }
    .task-share-page.phone .task-share-header {
      gap: var(--space-2);
    }
    .task-share-page.phone .header-controls {
      width: 100%;
      justify-content: space-between;
    }
  }

  /* ---- Name prompt modal ---- */
  .name-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(45, 31, 61, 0.6);
    z-index: 2000;
  }
  .name-modal {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 360px;
    max-width: calc(100vw - 2 * var(--space-4));
    background: var(--color-surface);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-lg);
    z-index: 2010;
    padding: var(--space-5);
  }
  .name-modal h2 {
    margin: 0 0 var(--space-2);
    font-family: var(--font-heading, var(--font-display));
    color: var(--color-plum);
    font-size: 1.25rem;
  }
  .name-modal p {
    margin: 0 0 var(--space-4);
    font-size: 0.875rem;
    color: var(--color-text-muted);
    line-height: 1.4;
  }
  .name-input {
    font: inherit;
    font-size: 1rem;
    width: 100%;
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: var(--color-surface);
  }
  .name-input:focus {
    outline: 2px solid var(--color-plum);
    outline-offset: 1px;
    border-color: var(--color-plum);
  }
  .name-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2);
    margin-top: var(--space-4);
  }
  .name-cancel {
    font: inherit;
    font-size: 0.8125rem;
    padding: var(--space-2) var(--space-4);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--color-text-muted);
    cursor: pointer;
  }
  .name-confirm {
    font: inherit;
    font-size: 0.8125rem;
    font-weight: 600;
    padding: var(--space-2) var(--space-4);
    border: none;
    border-radius: var(--radius-sm);
    background: var(--color-plum);
    color: var(--color-text-inverse);
    cursor: pointer;
  }
  .name-confirm:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  .name-confirm:hover:not(:disabled) {
    background: var(--color-plum-dark);
  }
</style>
