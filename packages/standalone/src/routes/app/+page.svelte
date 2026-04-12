<script lang="ts">
  /**
   * Show list page (/app). Displays a grid of show cards, one per
   * production. When Phase 1 storage lands, the mock data below gets
   * replaced with real showStorage.listShows() calls.
   *
   * Features wired up:
   * - Grid of ShowCard components with hover actions (open, duplicate,
   *   archive, export JSON, delete)
   * - Empty state with "Create your first show" CTA
   * - NewShowModal for creating a new show (name + dates)
   * - Filter toggle to show/hide archived shows
   *
   * NOT wired up yet (needs Phase 1 storage):
   * - Real data from IndexedDB / Supabase / R2
   * - Actual navigation to /app/[showId] on card click
   * - Real duplicate / archive / delete / export logic
   */
  import ShowCard from "$lib/components/app/ShowCard.svelte";
  import NewShowModal from "$lib/components/app/NewShowModal.svelte";

  let { data } = $props();

  let newShowOpen = $state(false);
  let showArchived = $state(false);

  // ---- Mock data (replaced by showStorage.listShows() in Phase 1) ----
  type MockShow = {
    id: string;
    name: string;
    startDate: string;
    endDate: string;
    castCount: number;
    updatedAt: string;
    archived: boolean;
  };

  let mockShows = $state<MockShow[]>([
    {
      id: "1",
      name: "Romeo & Juliet",
      startDate: "2026-05-04",
      endDate: "2026-06-14",
      castCount: 8,
      updatedAt: new Date(Date.now() - 2 * 60 * 60_000).toISOString(),
      archived: false,
    },
    {
      id: "2",
      name: "A Midsummer Night's Dream",
      startDate: "2026-08-01",
      endDate: "2026-09-20",
      castCount: 12,
      updatedAt: new Date(Date.now() - 3 * 24 * 60 * 60_000).toISOString(),
      archived: false,
    },
    {
      id: "3",
      name: "The Crucible",
      startDate: "2025-10-15",
      endDate: "2025-11-22",
      castCount: 15,
      updatedAt: new Date(Date.now() - 120 * 24 * 60 * 60_000).toISOString(),
      archived: true,
    },
  ]);

  const visibleShows = $derived(
    showArchived
      ? mockShows
      : mockShows.filter((s) => !s.archived),
  );

  const archivedCount = $derived(mockShows.filter((s) => s.archived).length);

  // ---- Stub handlers (real logic in Phase 1) ----

  function handleOpen(id: string) {
    // Phase 1: navigate to /app/[showId]
    alert(`Open show ${id} (wired in Phase 1)`);
  }

  function handleCreate(info: { name: string; startDate: string; endDate: string }) {
    // Phase 1: create a real ScheduleDoc and save to storage
    const newShow: MockShow = {
      id: crypto.randomUUID(),
      name: info.name,
      startDate: info.startDate,
      endDate: info.endDate,
      castCount: 0,
      updatedAt: new Date().toISOString(),
      archived: false,
    };
    mockShows = [newShow, ...mockShows];
    newShowOpen = false;
  }

  function handleDuplicate(id: string) {
    const original = mockShows.find((s) => s.id === id);
    if (!original) return;
    const copy: MockShow = {
      ...original,
      id: crypto.randomUUID(),
      name: `${original.name} (Copy)`,
      updatedAt: new Date().toISOString(),
      archived: false,
    };
    mockShows = [copy, ...mockShows];
  }

  function handleArchive(id: string) {
    mockShows = mockShows.map((s) =>
      s.id === id ? { ...s, archived: !s.archived, updatedAt: new Date().toISOString() } : s,
    );
  }

  function handleExport(id: string) {
    // Phase 1: download the show's ScheduleDoc as JSON
    alert(`Export show ${id} as JSON (wired in Phase 1)`);
  }

  function handleDelete(id: string) {
    if (!confirm("Delete this show permanently? This can't be undone.")) return;
    mockShows = mockShows.filter((s) => s.id !== id);
  }
</script>

<svelte:head>
  <title>My Shows - Rehearsal Block</title>
</svelte:head>

<div class="shows-page container">
  <div class="calendar-frame">
  <header class="page-header">
    <div>
      <h1>{(data.user?.email?.split("@")[0] ?? "My").charAt(0).toUpperCase() + (data.user?.email?.split("@")[0] ?? "y").slice(1)}'s Shows</h1>
    </div>
    <div class="header-actions">
      {#if archivedCount > 0}
        <button
          type="button"
          class="btn-toggle"
          class:active={showArchived}
          onclick={() => (showArchived = !showArchived)}
        >
          {showArchived ? "Hide archived" : `Show archived (${archivedCount})`}
        </button>
      {/if}
      <button
        type="button"
        class="btn btn-primary"
        onclick={() => (newShowOpen = true)}
      >
        + New Show
      </button>
    </div>
  </header>

  <!-- Calendar grid backdrop: 7 columns x 4 rows of faint cells.
       Show cards sit in the first cells; remaining cells are empty
       placeholders with a subtle dot in the corner. When there are
       no shows, the empty state CTA replaces the first cell. -->
  <div class="calendar-backdrop">
    <!-- Weekday header row placeholder - decorative lines matching
         the mockup, suggesting day-of-week labels above the grid -->
    <div class="weekday-headers">
      <div class="weekday-placeholder">
        <span class="weekday-line"></span>
      </div>
      <div class="weekday-placeholder">
        <span class="weekday-line"></span>
      </div>
      <div class="weekday-placeholder">
        <span class="weekday-line"></span>
      </div>
    </div>
    {#if mockShows.length === 0}
      <div class="calendar-cell calendar-cell-empty-state">
        <h2>Ready for your next production?</h2>
        <p>
          Create a show and start building your rehearsal schedule. Cast,
          production team, locations, conflicts, every rehearsal day - it
          all lives in one place.
        </p>
        <button
          type="button"
          class="btn btn-primary btn-lg"
          onclick={() => (newShowOpen = true)}
        >
          + New Show
        </button>
      </div>
      {#each Array(11) as _, i (i)}
        <div class="calendar-cell calendar-cell-placeholder">
          <span class="cell-dot"></span>
        </div>
      {/each}
    {:else}
      {#each visibleShows as show (show.id)}
        <div class="calendar-cell calendar-cell-filled">
          <ShowCard
            id={show.id}
            name={show.name}
            startDate={show.startDate}
            endDate={show.endDate}
            castCount={show.castCount}
            updatedAt={show.updatedAt}
            archived={show.archived}
            onopen={handleOpen}
            onarchive={handleArchive}
            onduplicate={handleDuplicate}
            ondelete={handleDelete}
            onexport={handleExport}
          />
        </div>
      {/each}
      <!-- Fill remaining cells to complete the grid -->
      {#each Array(Math.max(0, 12 - visibleShows.length)) as _, i (i)}
        <div class="calendar-cell calendar-cell-placeholder">
          <span class="cell-dot"></span>
        </div>
      {/each}
    {/if}
  </div>

  {#if visibleShows.length === 0 && mockShows.length > 0}
    <!-- All shows are archived and the filter is hiding them -->
    <div class="empty-state empty-state-muted">
      <p>All your shows are archived.</p>
      <button
        type="button"
        class="btn-toggle active"
        onclick={() => (showArchived = true)}
      >
        Show archived ({archivedCount})
      </button>
    </div>
  {/if}
  </div>
</div>

{#if newShowOpen}
  <NewShowModal
    onclose={() => (newShowOpen = false)}
    oncreate={handleCreate}
  />
{/if}

<style>
  .shows-page {
    max-width: 1400px;
    position: relative;
  }

  .calendar-frame {
    border: 1px solid #eff0f2;
    border-radius: var(--radius-lg);
    padding: var(--space-4);
    box-shadow: var(--shadow-md);
  }

  .calendar-backdrop {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 6px;
  }

  .weekday-headers {
    grid-column: 1 / -1;
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 6px;
    margin-bottom: 2px;
    background: #dfe1e5;
    border-radius: var(--radius-sm);
    padding: 10px 0;
    opacity: 0.3;
  }

  .weekday-placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .weekday-line {
    display: block;
    width: 30%;
    height: 10px;
    border-radius: 4px;
    background: #ffffff;
    opacity: 0.7;
  }

  .calendar-cell {
    border: 1px solid #eff0f2;
    border-radius: var(--radius-md);
    min-height: 280px;
    background: var(--color-surface);
  }

  .calendar-cell-placeholder {
    position: relative;
    background: linear-gradient(180deg, #ffffff 0%, #ffffff 50%, #f8f8f9 100%);
    border-color: var(--color-border);
    opacity: 0.6;
  }

  .cell-dot {
    position: absolute;
    top: 18px;
    left: 18px;
    width: 12px;
    height: 12px;
    border-radius: var(--radius-sm);
    background: #dfe1e5;
    opacity: 0.45;
  }

  .calendar-cell-filled {
    padding: 14px;
    display: flex;
  }
  .calendar-cell-filled :global(.show-card) {
    min-height: 0;
    flex: 1;
    border-radius: var(--radius-md);
    padding: var(--space-3) var(--space-3);
    font-size: 0.9em;
  }

  .calendar-cell-empty-state {
    grid-column: 1 / -1;
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    padding: var(--space-7) var(--space-5);
    gap: var(--space-3);
    border: 1px dashed var(--color-border-strong);
    background: var(--color-bg-alt);
  }

  .calendar-cell-empty-state h2 {
    font-size: 1.5rem;
    margin: 0;
  }

  .calendar-cell-empty-state p {
    max-width: 420px;
    color: var(--color-text-muted);
    line-height: 1.6;
    margin: 0;
  }

  .page-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--space-4);
    padding-bottom: var(--space-4);
    border-bottom: 1px solid #eff0f2;
    gap: var(--space-4);
    flex-wrap: wrap;
  }

  .page-header h1 {
    margin: 0;
    color: var(--color-plum-light);
    font-family: "Playfair Display", Georgia, serif;
    padding-left: 14px;
  }


  .header-actions {
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }

  .btn-toggle {
    font: inherit;
    font-size: 0.8125rem;
    font-weight: 500;
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--color-text-muted);
    cursor: pointer;
    transition: all var(--transition-fast);
  }
  .btn-toggle:hover {
    border-color: var(--color-text-muted);
    color: var(--color-text);
  }
  .btn-toggle.active {
    background: var(--color-plum);
    border-color: var(--color-plum);
    color: var(--color-text-inverse);
  }

  .empty-state-muted {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    padding: var(--space-6) var(--space-5);
    gap: var(--space-3);
  }
  .empty-state-muted p {
    color: var(--color-text-subtle);
    font-size: 0.9375rem;
    margin: 0;
  }

  @media (max-width: 768px) {
    .page-header {
      flex-direction: column;
      align-items: stretch;
    }
    .header-actions {
      justify-content: space-between;
    }
    .calendar-backdrop {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .calendar-cell-empty-state {
      grid-column: 1 / -1;
    }
  }
</style>
