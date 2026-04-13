<script lang="ts">
  /**
   * Show list page (/app). Displays a grid of show cards, one per
   * production. Reads metadata from Supabase (client-direct via RLS)
   * for the card grid - never decompresses doc blobs on this page.
   *
   * On localhost without real auth, falls back to IndexedDB-only listing.
   */
  import { goto } from "$app/navigation";
  import { onMount } from "svelte";
  import { type ScheduleDoc } from "@rehearsal-block/core";
  import ShowCard from "$lib/components/app/ShowCard.svelte";
  import NewShowModal from "$lib/components/app/NewShowModal.svelte";
  import MyDefaultsModal from "$lib/components/app/MyDefaultsModal.svelte";
  import { listShowsMeta, type ShowIndexRow } from "$lib/storage/index.js";
  import { localListShows, localSaveShow, localDeleteShow } from "$lib/storage/local.js";
  import type { StoredShow } from "$lib/storage/types.js";

  let { data } = $props();

  let newShowOpen = $state(false);
  let defaultsOpen = $state(false);
  let showArchived = $state(false);
  let loading = $state(true);
  let importInput: HTMLInputElement | undefined = $state();

  // Show data - either from Supabase metadata or local IndexedDB
  type ShowEntry = {
    id: string;
    name: string;
    startDate: string | null;
    endDate: string | null;
    castCount: number;
    updatedAt: string;
    archived: boolean;
  };

  let shows = $state<ShowEntry[]>([]);

  const isLocalhost = $derived(
    typeof window !== "undefined" &&
    (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"),
  );

  function metaToEntry(row: ShowIndexRow): ShowEntry {
    return {
      id: row.id,
      name: row.name,
      startDate: row.start_date,
      endDate: row.end_date,
      castCount: row.cast_count,
      updatedAt: row.updated_at,
      archived: !!row.archived_at,
    };
  }

  function storedToEntry(show: StoredShow): ShowEntry {
    return {
      id: show.id,
      name: show.name,
      startDate: show.document.show.startDate,
      endDate: show.document.show.endDate,
      castCount: show.document.cast.length,
      updatedAt: show.updatedAt,
      archived: false,
    };
  }

  async function loadShows() {
    loading = true;
    try {
      if (data.supabase && !isLocalhost) {
        // Production: read metadata from Supabase (client-direct via RLS)
        const rows = await listShowsMeta(data.supabase);
        shows = rows.map(metaToEntry);
      } else {
        // Localhost dev: read from IndexedDB
        const local = await localListShows();
        shows = local.map(storedToEntry);
      }
    } catch (err) {
      console.error("Failed to load shows:", err);
      // Fall back to IndexedDB
      try {
        const local = await localListShows();
        shows = local.map(storedToEntry);
      } catch {
        shows = [];
      }
    }
    loading = false;
  }

  onMount(() => {
    loadShows();
  });

  const visibleShows = $derived(
    showArchived
      ? shows
      : shows.filter((s) => !s.archived),
  );

  const archivedCount = $derived(shows.filter((s) => s.archived).length);

  // ---- Handlers ----

  function handleOpen(id: string) {
    const show = shows.find((s) => s.id === id);
    if (show?.archived) {
      // Auto-unarchive and open
      handleUnarchiveAndOpen(id);
    } else {
      goto(`/app/${id}`);
    }
  }

  async function handleUnarchiveAndOpen(id: string) {
    try {
      await fetch(`/api/shows/${id}/archive`, { method: "POST" });
      goto(`/app/${id}`);
    } catch (err) {
      console.error("Failed to unarchive:", err);
      // Still try to navigate
      goto(`/app/${id}`);
    }
  }

  async function handleCreate(doc: ScheduleDoc) {
    const id = crypto.randomUUID();

    try {
      if (!isLocalhost) {
        // Production: create via API (writes R2 + Supabase)
        await fetch("/api/shows", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, document: doc }),
        });
      }

      // Always save to IndexedDB for local-first
      const stored: StoredShow = {
        id,
        name: doc.show.name,
        updatedAt: new Date().toISOString(),
        document: doc,
      };
      await localSaveShow(stored);

      newShowOpen = false;
      goto(`/app/${id}`);
    } catch (err) {
      console.error("Failed to create show:", err);
      alert("Failed to create show. Please try again.");
    }
  }

  async function handleDuplicate(id: string) {
    try {
      // Need the full doc for duplication - fetch from API or IndexedDB
      let doc: ScheduleDoc;
      const localShow = await (await import("$lib/storage/local.js")).localLoadShow(id);

      if (localShow) {
        doc = JSON.parse(JSON.stringify(localShow.document));
      } else {
        const res = await fetch(`/api/shows/${id}`);
        if (!res.ok) throw new Error("Failed to load show for duplication");
        const data = await res.json();
        doc = JSON.parse(JSON.stringify(data.document));
      }

      doc.show.name = `${doc.show.name} (Copy)`;
      const newId = crypto.randomUUID();

      if (!isLocalhost) {
        await fetch("/api/shows", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: newId, document: doc }),
        });
      }

      const stored: StoredShow = {
        id: newId,
        name: doc.show.name,
        updatedAt: new Date().toISOString(),
        document: doc,
      };
      await localSaveShow(stored);

      await loadShows();
    } catch (err) {
      console.error("Failed to duplicate:", err);
      alert("Failed to duplicate show. Please try again.");
    }
  }

  async function handleArchive(id: string) {
    try {
      if (!isLocalhost) {
        await fetch(`/api/shows/${id}/archive`, { method: "POST" });
      }
      // Update local state
      shows = shows.map((s) =>
        s.id === id ? { ...s, archived: !s.archived, updatedAt: new Date().toISOString() } : s,
      );
    } catch (err) {
      console.error("Failed to toggle archive:", err);
    }
  }

  async function handleExport(id: string) {
    try {
      let doc: ScheduleDoc;
      const localShow = await (await import("$lib/storage/local.js")).localLoadShow(id);

      if (localShow) {
        doc = localShow.document;
      } else {
        const res = await fetch(`/api/shows/${id}`);
        if (!res.ok) throw new Error("Failed to load show for export");
        const data = await res.json();
        doc = data.document;
      }

      // Download as JSON
      const json = JSON.stringify(doc, null, 2);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const datePart = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `${doc.show.name || "show"}-${datePart}.json`;
      a.click();
      URL.revokeObjectURL(url);

      // Log export activity
      if (!isLocalhost) {
        fetch(`/api/shows/${id}/export-activity`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "exported_json" }),
        }).catch(() => {});
      }
    } catch (err) {
      console.error("Failed to export:", err);
      alert("Failed to export show. Please try again.");
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this show permanently? This can't be undone.")) return;
    try {
      if (!isLocalhost) {
        await fetch(`/api/shows/${id}`, { method: "DELETE" });
      }
      await localDeleteShow(id);
      shows = shows.filter((s) => s.id !== id);
    } catch (err) {
      console.error("Failed to delete:", err);
      alert("Failed to delete show. Please try again.");
    }
  }

  async function handleImport() {
    importInput?.click();
  }

  async function onImportFile(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const doc = JSON.parse(text) as ScheduleDoc;

      // Validate
      if (!doc.version || !doc.show || !doc.cast || !doc.schedule) {
        throw new Error("Invalid show file - missing required fields");
      }

      const id = crypto.randomUUID();
      doc.show.name = doc.show.name || "Imported Show";

      if (!isLocalhost) {
        await fetch("/api/shows", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, document: doc }),
        });
      }

      const stored: StoredShow = {
        id,
        name: doc.show.name,
        updatedAt: new Date().toISOString(),
        document: doc,
      };
      await localSaveShow(stored);

      await loadShows();
    } catch (err) {
      console.error("Import failed:", err);
      alert("Failed to import show. Make sure this is a valid Rehearsal Block JSON file.");
    }

    // Reset input so re-importing the same file triggers change
    input.value = "";
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
        class="defaults-btn"
        title="My Defaults"
        onclick={() => (defaultsOpen = true)}
      >
        <svg width="18" height="18" viewBox="0 -960 960 960" aria-hidden="true">
          <path d="m370-80-16-128q-13-5-24.5-12T307-235l-119 50L78-375l103-78q-1-7-1-13.5v-27q0-6.5 1-13.5L78-585l110-190 119 50q11-8 23-15t24-12l16-128h220l16 128q13 5 24.5 12t22.5 15l119-50 110 190-103 78q1 7 1 13.5v27q0 6.5-2 13.5l103 78-110 190-118-50q-11 8-23 15t-24 12L590-80H370Zm70-80h79l14-106q31-8 57.5-23.5T639-327l99 41 39-68-86-65q5-14 7-29.5t2-31.5q0-16-2-31.5t-7-29.5l86-65-39-68-99 42q-22-23-48.5-38.5T533-694l-13-106h-79l-14 106q-31 8-57.5 23.5T321-633l-99-41-39 68 86 64q-5 15-7 30t-2 32q0 16 2 31t7 30l-86 65 39 68 99-42q22 23 48.5 38.5T427-266l13 106Zm42-180q58 0 99-41t41-99q0-58-41-99t-99-41q-59 0-99.5 41T342-480q0 58 40.5 99t99.5 41Zm-2-140Z" fill="currentColor"/>
        </svg>
      </button>
      <button
        type="button"
        class="btn btn-secondary btn-sm"
        onclick={handleImport}
      >
        Import JSON
      </button>
      <button
        type="button"
        class="btn btn-primary"
        onclick={() => (newShowOpen = true)}
      >
        + New Show
      </button>
    </div>
  </header>

  <!-- Hidden file input for JSON import -->
  <input
    type="file"
    accept=".json"
    class="sr-only"
    bind:this={importInput}
    onchange={onImportFile}
  />

  {#if loading}
    <div class="loading-state">
      <p>Loading shows...</p>
    </div>
  {:else}
  <div class="calendar-backdrop">
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
    {#if shows.length === 0}
      <div class="calendar-cell calendar-cell-empty-state">
        <h2>Ready for your next production?</h2>
        <p>
          Create a show and start building your rehearsal schedule. Cast,
          production team, locations, conflicts, every rehearsal day - it
          all lives in one place.
        </p>
        <div class="empty-actions">
          <button
            type="button"
            class="btn btn-primary btn-lg"
            onclick={() => (newShowOpen = true)}
          >
            + New Show
          </button>
          <button
            type="button"
            class="btn btn-secondary"
            onclick={handleImport}
          >
            Import from JSON
          </button>
        </div>
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
            startDate={show.startDate ?? ""}
            endDate={show.endDate ?? ""}
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
      {#each Array(Math.max(0, 12 - visibleShows.length)) as _, i (i)}
        <div class="calendar-cell calendar-cell-placeholder">
          <span class="cell-dot"></span>
        </div>
      {/each}
    {/if}
  </div>

  {#if visibleShows.length === 0 && shows.length > 0}
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
  {/if}
  </div>
</div>

{#if newShowOpen}
  <NewShowModal
    onclose={() => (newShowOpen = false)}
    oncreate={handleCreate}
  />
{/if}

{#if defaultsOpen}
  <MyDefaultsModal onclose={() => (defaultsOpen = false)} />
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

  .empty-actions {
    display: flex;
    gap: var(--space-3);
    align-items: center;
    flex-wrap: wrap;
    justify-content: center;
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

  .defaults-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    padding: 0;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--color-text-muted);
    cursor: pointer;
    transition: all var(--transition-fast);
  }
  .defaults-btn:hover {
    color: var(--color-plum);
    border-color: var(--color-plum);
    background: rgba(45, 31, 61, 0.04);
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

  .btn-secondary {
    background: transparent;
    border: 1px solid var(--color-border);
    color: var(--color-text-muted);
    font-weight: 500;
  }
  .btn-secondary:hover {
    border-color: var(--color-text-muted);
    color: var(--color-text);
  }

  .btn-sm {
    font-size: 0.8125rem;
    padding: var(--space-2) var(--space-3);
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  .loading-state {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 300px;
    color: var(--color-text-muted);
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
      flex-wrap: wrap;
    }
    .calendar-backdrop {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .calendar-cell-empty-state {
      grid-column: 1 / -1;
    }
  }
</style>
