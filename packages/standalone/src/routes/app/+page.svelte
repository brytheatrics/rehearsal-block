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
  <header class="page-header">
    <div>
      <h1>My Shows</h1>
      <p class="welcome">
        Welcome back{data.user?.email ? `, ${data.user.email.split("@")[0]}` : ""}.
        {#if mockShows.filter(s => !s.archived).length > 0}
          You have {mockShows.filter(s => !s.archived).length} active {mockShows.filter(s => !s.archived).length === 1 ? "show" : "shows"}.
        {/if}
      </p>
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

  {#if mockShows.length === 0}
    <!-- Empty state: no shows at all (brand new user) -->
    <div class="empty-state">
      <!-- Stage curtain illustration: two draped curtain panels framing
           an empty stage with a single spotlight circle. Plum curtains,
           teal spotlight, warm wood stage floor. All inline SVG. -->
      <svg class="empty-icon" width="160" height="120" viewBox="0 0 160 120" fill="none" aria-hidden="true">
        <!-- Stage floor -->
        <rect x="20" y="88" width="120" height="32" rx="2" fill="#5c4a3a" opacity="0.15"/>
        <rect x="20" y="88" width="120" height="4" rx="1" fill="#5c4a3a" opacity="0.25"/>

        <!-- Valance (top curtain bar) -->
        <rect x="10" y="4" width="140" height="12" rx="3" fill="var(--color-plum)" opacity="0.8"/>
        <rect x="10" y="12" width="140" height="8" rx="0" fill="var(--color-plum)" opacity="0.5"/>
        <!-- Valance scallops -->
        <ellipse cx="40" cy="20" rx="15" ry="6" fill="var(--color-plum)" opacity="0.4"/>
        <ellipse cx="80" cy="20" rx="15" ry="6" fill="var(--color-plum)" opacity="0.4"/>
        <ellipse cx="120" cy="20" rx="15" ry="6" fill="var(--color-plum)" opacity="0.4"/>

        <!-- Left curtain -->
        <path d="M10 16 C10 16, 14 40, 10 65 C8 75, 12 85, 10 92 L38 92 C36 80, 42 60, 38 40 C36 28, 40 20, 42 16 Z" fill="var(--color-plum)" opacity="0.6"/>
        <path d="M10 16 C12 30, 8 50, 10 65" stroke="var(--color-plum-light)" stroke-width="0.5" opacity="0.5"/>
        <path d="M25 16 C27 35, 23 55, 25 75" stroke="var(--color-plum-light)" stroke-width="0.5" opacity="0.3"/>

        <!-- Right curtain -->
        <path d="M150 16 C150 16, 146 40, 150 65 C152 75, 148 85, 150 92 L122 92 C124 80, 118 60, 122 40 C124 28, 120 20, 118 16 Z" fill="var(--color-plum)" opacity="0.6"/>
        <path d="M150 16 C148 30, 152 50, 150 65" stroke="var(--color-plum-light)" stroke-width="0.5" opacity="0.5"/>
        <path d="M135 16 C133 35, 137 55, 135 75" stroke="var(--color-plum-light)" stroke-width="0.5" opacity="0.3"/>

        <!-- Spotlight on empty stage -->
        <ellipse cx="80" cy="88" rx="28" ry="8" fill="var(--color-teal)" opacity="0.12"/>
        <ellipse cx="80" cy="88" rx="18" ry="5" fill="var(--color-teal)" opacity="0.15"/>
        <!-- Spotlight beam from above -->
        <path d="M80 0 L62 88 L98 88 Z" fill="var(--color-teal)" opacity="0.04"/>
      </svg>
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
  {:else if visibleShows.length === 0}
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
  {:else}
    <div class="shows-grid">
      {#each visibleShows as show (show.id)}
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
      {/each}
    </div>
  {/if}
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
  }

  .page-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--space-6);
    gap: var(--space-4);
    flex-wrap: wrap;
  }

  .page-header h1 {
    margin: 0;
  }

  .welcome {
    color: var(--color-text-muted);
    font-size: 0.9375rem;
    margin: var(--space-1) 0 0 0;
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

  .shows-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: var(--space-4);
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    padding: var(--space-8) var(--space-5);
    gap: var(--space-3);
  }

  .empty-icon {
    opacity: 0.8;
  }

  .empty-state h2 {
    font-size: 1.5rem;
    margin: 0;
  }

  .empty-state p {
    max-width: 420px;
    color: var(--color-text-muted);
    line-height: 1.6;
    margin: 0;
  }

  .empty-state-muted {
    padding: var(--space-6) var(--space-5);
  }
  .empty-state-muted p {
    color: var(--color-text-subtle);
    font-size: 0.9375rem;
  }

  @media (max-width: 768px) {
    .page-header {
      flex-direction: column;
      align-items: stretch;
    }
    .header-actions {
      justify-content: space-between;
    }
  }
</style>
