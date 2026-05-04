<script lang="ts">
  /**
   * Left-side panel that replaces the cast Sidebar in Task Schedule mode.
   *
   * Two sections:
   * - Backlog: unscheduled tasks (`doc.backlog`). Each row is draggable -
   *   drop on a day cell to move it from backlog to that day. Has its own
   *   "Add task" input at the top.
   * - Completed: every task across the doc with `done: true`. Click ↺ to
   *   uncheck, which flips `done: false` on the original day's task entry.
   *   If the original day is in the past, the existing view-only carryover
   *   renderer in DayCell prepends it to today's cell automatically - no
   *   separate "move to next build day" mutation needed.
   */
  import type { ScheduleDoc, Task } from "@rehearsal-block/core";

  interface Props {
    show: ScheduleDoc;
    onaddbacklog: (text: string) => void;
    onremovebacklog: (taskId: string) => void;
    /**
     * Toggle done on a task identified by its location. `where` is either
     * an ISO date (a day's task) or "backlog" (an unscheduled task).
     */
    ontoggletask: (where: string | "backlog", taskId: string) => void;
  }

  const { show, onaddbacklog, onremovebacklog, ontoggletask }: Props = $props();

  let newBacklogText = $state("");

  function commitBacklog() {
    const trimmed = newBacklogText.trim();
    if (!trimmed) return;
    onaddbacklog(trimmed);
    newBacklogText = "";
  }

  /**
   * Drag a backlog task. Carries `text/rb-backlog-task` with the task id
   * so DayCell's drop dispatcher can route it to the move-to-day flow.
   *
   * `effectAllowed` is "copyMove" rather than "move" so the day cell's
   * drop targets - which set `dropEffect: copy` to match the existing
   * call/note chip pattern - aren't rejected by the browser as
   * incompatible.
   */
  function dragBacklogTask(e: DragEvent, taskId: string) {
    if (!e.dataTransfer) return;
    e.dataTransfer.setData("text/rb-backlog-task", taskId);
    e.dataTransfer.setData("text/plain", "Task");
    e.dataTransfer.effectAllowed = "copyMove";
  }

  /** All tasks marked done across the doc, with their origin location.
   *  Sorted by completion timestamp descending (most recent first), with
   *  any timestamp-less entries at the bottom. */
  type CompletedRow = { task: Task; where: string | "backlog" };
  const completed = $derived.by<CompletedRow[]>(() => {
    const rows: CompletedRow[] = [];
    for (const t of show.backlog ?? []) {
      if (t.done) rows.push({ task: t, where: "backlog" });
    }
    for (const [iso, day] of Object.entries(show.schedule)) {
      for (const t of day?.tasks ?? []) {
        if (t.done) rows.push({ task: t, where: iso });
      }
    }
    rows.sort((a, b) => {
      const ta = a.task.doneAt ?? "";
      const tb = b.task.doneAt ?? "";
      if (!ta && !tb) return 0;
      if (!ta) return 1;
      if (!tb) return -1;
      return tb.localeCompare(ta);
    });
    return rows;
  });

  function formatWhereLabel(where: string | "backlog"): string {
    if (where === "backlog") return "from backlog";
    const [, mm, dd] = where.split("-").map(Number);
    if (!mm || !dd) return where;
    const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    return `from ${months[mm - 1]} ${dd}`;
  }
</script>

<aside class="task-sidebar">
  <section class="ts-section">
    <header class="ts-header">
      <h3>Backlog</h3>
      <span class="ts-count">{show.backlog?.filter((t) => !t.done).length ?? 0}</span>
    </header>
    <p class="ts-hint">Unscheduled tasks. Drag onto a day to schedule it.</p>
    <div class="ts-add-row">
      <input
        type="text"
        class="ts-add-input"
        placeholder="Add task..."
        value={newBacklogText}
        oninput={(e) => (newBacklogText = e.currentTarget.value)}
        onkeydown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commitBacklog();
          }
        }}
      />
      <button
        type="button"
        class="ts-add-btn"
        disabled={!newBacklogText.trim()}
        onclick={commitBacklog}
      >Add</button>
    </div>
    {#if (show.backlog ?? []).filter((t) => !t.done).length === 0}
      <p class="ts-empty">No unscheduled tasks.</p>
    {:else}
      <ul class="ts-list">
        {#each (show.backlog ?? []).filter((t) => !t.done) as task (task.id)}
          <li
            class="ts-row backlog-row"
            draggable="true"
            ondragstart={(e) => dragBacklogTask(e, task.id)}
            title="Drag onto a day to schedule"
          >
            <span class="ts-handle" aria-hidden="true">⋮⋮</span>
            <span class="ts-text">{task.text}</span>
            <button
              type="button"
              class="ts-icon-btn ts-icon-danger"
              title="Remove from backlog"
              aria-label={`Remove ${task.text}`}
              onclick={() => onremovebacklog(task.id)}
            >×</button>
          </li>
        {/each}
      </ul>
    {/if}
  </section>

  <section class="ts-section">
    <header class="ts-header">
      <h3>Completed</h3>
      <span class="ts-count">{completed.length}</span>
    </header>
    {#if completed.length === 0}
      <p class="ts-empty">Nothing complete yet.</p>
    {:else}
      <ul class="ts-list">
        {#each completed as row (row.where + ":" + row.task.id)}
          <li class="ts-row completed-row">
            <button
              type="button"
              class="ts-icon-btn ts-icon-uncheck"
              title="Uncheck (return to its day)"
              aria-label={`Uncheck ${row.task.text}`}
              onclick={() => ontoggletask(row.where, row.task.id)}
            >↺</button>
            <span class="ts-text done">{row.task.text}</span>
            <span class="ts-where">{formatWhereLabel(row.where)}</span>
          </li>
        {/each}
      </ul>
    {/if}
  </section>
</aside>

<style>
  .task-sidebar {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    min-width: 0;
  }

  .ts-section {
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    padding: var(--space-3);
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .ts-header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-2);
  }
  .ts-header h3 {
    margin: 0;
    font-family: var(--font-display);
    font-size: 0.9375rem;
    color: var(--color-plum);
  }
  .ts-count {
    font-size: 0.75rem;
    color: var(--color-text-muted);
    font-weight: 500;
  }

  .ts-hint {
    margin: 0;
    font-size: 0.6875rem;
    color: var(--color-text-subtle);
    line-height: 1.3;
  }

  .ts-empty {
    margin: 0;
    font-size: 0.75rem;
    color: var(--color-text-subtle);
    font-style: italic;
    padding: var(--space-2);
  }

  .ts-add-row {
    display: flex;
    gap: 4px;
  }
  .ts-add-input {
    font: inherit;
    font-size: 0.8125rem;
    flex: 1;
    min-width: 0;
    padding: 4px 8px;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: var(--color-surface);
  }
  .ts-add-input:focus {
    outline: 2px solid var(--color-plum);
    outline-offset: 1px;
    border-color: var(--color-plum);
  }
  .ts-add-btn {
    font: inherit;
    font-size: 0.75rem;
    font-weight: 600;
    padding: 4px 8px;
    border: none;
    border-radius: var(--radius-sm);
    background: var(--color-plum);
    color: var(--color-text-inverse);
    cursor: pointer;
  }
  .ts-add-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  .ts-add-btn:hover:not(:disabled) {
    background: var(--color-plum-dark);
  }

  .ts-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .ts-row {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 6px;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: var(--color-surface);
    font-size: 0.8125rem;
    line-height: 1.3;
  }
  .backlog-row {
    cursor: grab;
  }
  .backlog-row:active {
    cursor: grabbing;
  }
  .backlog-row:hover {
    border-color: var(--color-teal);
  }

  .ts-handle {
    color: var(--color-text-subtle);
    font-size: 0.75rem;
    user-select: none;
    flex-shrink: 0;
  }
  .ts-text {
    flex: 1;
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .ts-text.done {
    text-decoration: line-through;
    color: var(--color-text-muted);
  }
  .ts-where {
    font-size: 0.6875rem;
    color: var(--color-text-subtle);
    font-style: italic;
    flex-shrink: 0;
  }

  .ts-icon-btn {
    font: inherit;
    font-size: 0.875rem;
    line-height: 1;
    width: 20px;
    height: 20px;
    padding: 0;
    border: 1px solid transparent;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--color-text-muted);
    cursor: pointer;
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  .ts-icon-btn:hover {
    border-color: var(--color-border);
    color: var(--color-text);
  }
  .ts-icon-danger:hover {
    color: var(--color-danger);
    border-color: var(--color-danger);
  }
  .ts-icon-uncheck:hover {
    color: var(--color-teal);
    border-color: var(--color-teal);
  }
</style>
