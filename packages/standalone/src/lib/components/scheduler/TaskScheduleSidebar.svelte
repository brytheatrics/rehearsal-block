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
  import type { ScheduleDoc, ShowFile, Task } from "@rehearsal-block/core";
  import { showFileUrl, formatFileSize } from "$lib/show-files.js";

  interface Props {
    show: ScheduleDoc;
    /**
     * When true (carpenter share view), the sidebar hides editing
     * affordances: the "Add task" input, the X-to-remove buttons on
     * backlog rows, the drag handle on backlog rows, and the "Clear"
     * button on the Completed section. Toggling done state via the
     * row checkbox / Completed uncheck button stays available so
     * carpenters can still drive the workflow.
     */
    readOnly?: boolean;
    onaddbacklog?: (text: string) => void;
    onremovebacklog?: (taskId: string) => void;
    /**
     * Toggle done on a task identified by its location. `where` is either
     * an ISO date (a day's task) or "backlog" (an unscheduled task).
     */
    ontoggletask: (where: string | "backlog", taskId: string) => void;
    /**
     * User clicked "Clear" in the Completed header. The parent owns the
     * confirm modal (rendered at page level so it escapes the sidebar's
     * sticky/overflow stacking context) and the actual mutation.
     */
    onrequestclearcompleted?: () => void;
    /**
     * Drawings panel upload + delete callbacks. Owned by the parent so
     * the parent can show toasts, handle progress, and write the
     * resulting ShowFile metadata onto `doc.files`. Only used in
     * editor mode - in readOnly (carpenter) mode the upload button is
     * hidden and the row-level delete buttons hide too.
     */
    onuploadfile?: (file: File) => void;
    onremovefile?: (file: ShowFile) => void;
    /**
     * Initial collapse state for the three sections (Backlog, Completed,
     * Uploads). Defaults to true (all expanded). The carpenter share view
     * passes false on mobile so the list doesn't get pushed off-screen
     * by three big stacked panels.
     */
    sectionsExpandedByDefault?: boolean;
    /**
     * Carpenter-mode-only callbacks. Same name space as the editor
     * onaddbacklog but distinct so we can permit "carpenter adds an
     * unscheduled task" in readOnly without enabling text editing.
     * Wired by TaskShareView to /api/share-mutate.
     */
    oncarpenteraddbacklog?: (text: string) => void;
    /** Carpenter moves a backlog task onto today's date. */
    oncarpentermovetotoday?: (taskId: string) => void;
    /**
     * Editor moves a day task back to the Backlog. Fired when a
     * `text/rb-day-task` drag from DayEditor is dropped on the
     * Backlog section. Disabled in readOnly mode.
     */
    onmovedaytaskbacklog?: (fromDate: string, taskId: string) => void;
  }

  const {
    show,
    readOnly = false,
    onaddbacklog,
    onremovebacklog,
    ontoggletask,
    onrequestclearcompleted,
    onuploadfile,
    onremovefile,
    sectionsExpandedByDefault = true,
    oncarpenteraddbacklog,
    oncarpentermovetotoday,
    onmovedaytaskbacklog,
  }: Props = $props();

  /* Backlog-section drop target state. Lights up the section border
     while a day-task drag hovers over it. */
  let backlogDragOver = $state(false);

  function backlogDragOverHandler(e: DragEvent) {
    if (readOnly || !onmovedaytaskbacklog) return;
    if (!e.dataTransfer?.types.includes("text/rb-day-task")) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    backlogDragOver = true;
  }

  function backlogDragLeaveHandler() {
    backlogDragOver = false;
  }

  function backlogDropHandler(e: DragEvent) {
    backlogDragOver = false;
    if (readOnly || !onmovedaytaskbacklog) return;
    const payload = e.dataTransfer?.getData("text/rb-day-task");
    if (!payload) return;
    const colon = payload.indexOf(":");
    if (colon < 0) return;
    const fromDate = payload.slice(0, colon);
    const taskId = payload.slice(colon + 1);
    if (!fromDate || !taskId) return;
    e.preventDefault();
    e.stopPropagation();
    onmovedaytaskbacklog(fromDate, taskId);
  }

  /* File picker for the Drawings upload button. Hidden input + a
     styled trigger button works around the limited <input type="file">
     styling. */
  let fileInputEl = $state<HTMLInputElement | null>(null);

  function pickFiles() {
    fileInputEl?.click();
  }

  function onFilePicked(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const list = input.files;
    if (!list) return;
    for (const f of Array.from(list)) {
      onuploadfile?.(f);
    }
    /* Reset so re-picking the same file fires change again. */
    input.value = "";
  }

  function fileIcon(mime: string): string {
    if (mime.startsWith("image/")) return "🖼";
    if (mime === "application/pdf") return "📄";
    return "📎";
  }

  /* Per-section collapse state. Default open everywhere - the
     read-only / carpenter view sets these to closed on mobile via
     the `collapsedDefault` prop so a phone-sized share link doesn't
     bury the list view under three big stacked panels. */
  let backlogOpen = $state(sectionsExpandedByDefault);
  let completedOpen = $state(sectionsExpandedByDefault);
  let uploadsOpen = $state(sectionsExpandedByDefault);

  /* "Add to today" - carpenter helper for moveBacklogToToday. Editor
     uses drag-and-drop, which doesn't work on phones, so carpenters
     get a button on each backlog row instead. */
  function todayIsoForCarpenter(): string {
    return new Date().toISOString().slice(0, 10);
  }

  let newBacklogText = $state("");

  function commitBacklog() {
    const trimmed = newBacklogText.trim();
    if (!trimmed) return;
    if (readOnly) {
      oncarpenteraddbacklog?.(trimmed);
    } else {
      onaddbacklog?.(trimmed);
    }
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
  <section
    class="ts-section ts-section-backlog"
    class:collapsed={!backlogOpen}
    class:drop-target={backlogDragOver}
    role="region"
    aria-label="Backlog"
    ondragover={backlogDragOverHandler}
    ondragleave={backlogDragLeaveHandler}
    ondrop={backlogDropHandler}
  >
    <div class="ts-section-row">
      <button
        type="button"
        class="ts-section-toggle"
        aria-expanded={backlogOpen}
        onclick={() => (backlogOpen = !backlogOpen)}
      >
        <span class="ts-chevron" aria-hidden="true">{backlogOpen ? "▾" : "▸"}</span>
        <h3>Backlog</h3>
        <span class="ts-count">{show.backlog?.filter((t) => !t.done).length ?? 0}</span>
      </button>
    </div>
    {#if backlogOpen}
    {#if readOnly}
      {#if oncarpenteraddbacklog}
        <p class="ts-hint">Add a task you've spotted, or tap → to start it today.</p>
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
      {:else}
        <p class="ts-hint">Unscheduled tasks.</p>
      {/if}
    {:else}
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
    {/if}
    {#if (show.backlog ?? []).filter((t) => !t.done).length === 0}
      <p class="ts-empty">No unscheduled tasks.</p>
    {:else}
      <ul class="ts-list">
        {#each (show.backlog ?? []).filter((t) => !t.done) as task (task.id)}
          <li
            class="ts-row backlog-row"
            class:read-only={readOnly}
            draggable={readOnly ? "false" : "true"}
            ondragstart={readOnly ? undefined : (e) => dragBacklogTask(e, task.id)}
            title={readOnly ? undefined : "Drag onto a day to schedule"}
          >
            {#if !readOnly}
              <span class="ts-handle" aria-hidden="true">⋮⋮</span>
            {/if}
            <span class="ts-text">{task.text}</span>
            {#if readOnly && oncarpentermovetotoday}
              <button
                type="button"
                class="ts-icon-btn ts-icon-teal"
                title="Move to today"
                aria-label={`Move "${task.text}" to today`}
                onclick={() => oncarpentermovetotoday(task.id)}
              >→</button>
            {/if}
            {#if !readOnly}
              <button
                type="button"
                class="ts-icon-btn ts-icon-danger"
                title="Remove from backlog"
                aria-label={`Remove ${task.text}`}
                onclick={() => onremovebacklog?.(task.id)}
              >×</button>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
    {/if}
  </section>

  <section class="ts-section ts-section-completed" class:collapsed={!completedOpen}>
    <div class="ts-section-row">
      <button
        type="button"
        class="ts-section-toggle"
        aria-expanded={completedOpen}
        onclick={() => (completedOpen = !completedOpen)}
      >
        <span class="ts-chevron" aria-hidden="true">{completedOpen ? "▾" : "▸"}</span>
        <h3>Completed</h3>
        <span class="ts-count">{completed.length}</span>
      </button>
      {#if completed.length > 0 && !readOnly}
        <button
          type="button"
          class="ts-clear-btn"
          title="Permanently delete all completed tasks"
          onclick={() => onrequestclearcompleted?.()}
        >Clear</button>
      {/if}
    </div>
    {#if completedOpen}
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
    {/if}
  </section>

  <section class="ts-section ts-section-uploads" class:collapsed={!uploadsOpen}>
    <div class="ts-section-row">
      <button
        type="button"
        class="ts-section-toggle"
        aria-expanded={uploadsOpen}
        onclick={() => (uploadsOpen = !uploadsOpen)}
      >
        <span class="ts-chevron" aria-hidden="true">{uploadsOpen ? "▾" : "▸"}</span>
        <h3>Uploads</h3>
        <span class="ts-count">{show.files?.length ?? 0}</span>
      </button>
      {#if !readOnly}
        <button
          type="button"
          class="ts-clear-btn"
          title="Upload a PDF or photo"
          onclick={pickFiles}
        >Upload</button>
      {/if}
    </div>
    {#if uploadsOpen}
    {#if !readOnly}
      <p class="ts-hint">PDFs and photos. Click to open. <strong>×</strong> to delete.</p>
      <input
        type="file"
        accept="application/pdf,image/*"
        multiple
        class="ts-file-input"
        bind:this={fileInputEl}
        onchange={onFilePicked}
      />
    {:else}
      <p class="ts-hint">Files for this build. Tap to open.</p>
    {/if}
    {#if !show.files || show.files.length === 0}
      <p class="ts-empty">Nothing uploaded yet.</p>
    {:else}
      <ul class="ts-list">
        {#each show.files as file (file.id)}
          <li class="ts-row file-row">
            <span class="file-icon" aria-hidden="true">{fileIcon(file.mimeType)}</span>
            <a
              href={showFileUrl(file)}
              target="_blank"
              rel="noopener"
              class="file-link"
              title={`${file.name} - ${formatFileSize(file.size)}`}
            >{file.name}</a>
            {#if !readOnly}
              <button
                type="button"
                class="ts-icon-btn ts-icon-danger"
                title="Remove drawing"
                aria-label={`Remove ${file.name}`}
                onclick={() => onremovefile?.(file)}
              >×</button>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
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

  .ts-section-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }
  .ts-section-toggle {
    appearance: none;
    background: none;
    border: none;
    padding: 0;
    margin: 0;
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: baseline;
    justify-content: flex-start;
    gap: var(--space-2);
    cursor: pointer;
    color: inherit;
    text-align: left;
    font: inherit;
  }
  .ts-chevron {
    display: inline-block;
    width: 14px;
    color: var(--color-text-muted);
    font-size: 0.75rem;
    flex-shrink: 0;
  }
  .ts-section-toggle h3 {
    margin: 0;
    font-family: var(--font-display);
    font-size: 0.9375rem;
    color: var(--color-plum);
  }
  .ts-section.drop-target {
    border-color: var(--color-teal);
    background: rgba(56, 129, 125, 0.06);
  }
  .ts-section.collapsed {
    /* Tighten padding when collapsed so the header row is the
       only thing visible. */
    padding-bottom: var(--space-2);
    gap: 0;
  }

  .ts-icon-teal {
    color: var(--color-teal);
    font-weight: 700;
  }
  .ts-icon-teal:hover {
    border-color: var(--color-teal);
    background: rgba(56, 129, 125, 0.08);
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

  .ts-count {
    font-size: 0.75rem;
    color: var(--color-text-muted);
    font-weight: 500;
  }

  .ts-clear-btn {
    font: inherit;
    font-size: 0.6875rem;
    font-weight: 500;
    padding: 2px 8px;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--color-text-muted);
    cursor: pointer;
  }
  .ts-clear-btn:hover {
    border-color: var(--color-danger);
    color: var(--color-danger);
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
  .backlog-row.read-only {
    cursor: default;
  }
  .backlog-row.read-only:hover {
    border-color: var(--color-border);
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

  /* ---- Drawings section ---- */
  .ts-file-input {
    display: none;
  }
  .file-row {
    /* Override grab cursor from .backlog-row by being more specific. */
    cursor: default;
  }
  .file-icon {
    font-size: 0.875rem;
    flex-shrink: 0;
  }
  .file-link {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--color-text);
    text-decoration: none;
  }
  .file-link:hover {
    color: var(--color-teal);
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  /* Mobile: sidebar sits below the calendar/list. Reorder the three
     sections so the actionable ones (Backlog, Uploads) come before
     the archival Completed list. Desktop keeps the original visual
     order (Backlog above Completed above Uploads). Breakpoint matches
     the ScheduleEditor's grid collapse. */
  @media (max-width: 900px) {
    .ts-section-backlog { order: 1; }
    .ts-section-uploads { order: 2; }
    .ts-section-completed { order: 3; }
  }
</style>
