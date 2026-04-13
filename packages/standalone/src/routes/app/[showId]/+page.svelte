<script lang="ts">
  /**
   * Show editor page (/app/[showId]).
   *
   * Loads the document from IndexedDB (instant) with an API fallback,
   * then renders the shared ScheduleEditor. Every edit triggers an
   * auto-save to IndexedDB via the onDocChange callback. The sync
   * layer handles idle-debounced cloud push.
   */
  import { onMount, onDestroy } from "svelte";
  import type { ScheduleDoc } from "@rehearsal-block/core";
  import ScheduleEditor from "$lib/components/scheduler/ScheduleEditor.svelte";
  import { localLoadShow, localSaveShow } from "$lib/storage/local.js";
  import { createSyncedStorage, type SyncedStorage } from "$lib/storage/sync.js";
  import { createSupabaseBrowserClient } from "$lib/supabase/client.js";

  let { data } = $props();

  let doc = $state<ScheduleDoc | null>(null);
  let loading = $state(true);
  let loadError = $state<string | null>(null);
  let syncedStorage = $state<SyncedStorage | null>(null);

  const isLocalhost =
    typeof window !== "undefined" &&
    (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");

  onMount(async () => {
    const showId = data.showId;

    // Try IndexedDB first (instant)
    const localShow = await localLoadShow(showId);
    if (localShow) {
      doc = localShow.document;
      loading = false;
    }

    // If not in IndexedDB, fetch from API
    if (!doc) {
      try {
        const res = await fetch(`/api/shows/${showId}`);
        if (!res.ok) {
          loadError = res.status === 404 ? "Show not found" : "Failed to load show";
          loading = false;
          return;
        }
        const show = await res.json();
        doc = show.document;

        // Cache in IndexedDB
        await localSaveShow({
          id: showId,
          name: show.name,
          updatedAt: show.updatedAt,
          document: show.document,
        });
      } catch {
        if (!doc) {
          loadError = "Failed to load show. Check your connection.";
        }
      }
      loading = false;
    }

    // Set up sync layer for cloud push (production only)
    if (!isLocalhost && data.user) {
      const supabase = createSupabaseBrowserClient();
      syncedStorage = createSyncedStorage({
        userId: data.user.id,
        supabase,
      });
    }
  });

  onDestroy(() => {
    syncedStorage?.destroy();
  });

  async function handleSave(updatedDoc: ScheduleDoc) {
    const showId = data.showId;
    await localSaveShow({
      id: showId,
      name: updatedDoc.show.name,
      updatedAt: new Date().toISOString(),
      document: updatedDoc,
    });

    // Force immediate cloud sync
    if (syncedStorage) {
      await syncedStorage.flush(showId);
    }
  }

  function handleDocChange(updatedDoc: ScheduleDoc) {
    const showId = data.showId;
    // Auto-save to IndexedDB on every change (instant)
    localSaveShow({
      id: showId,
      name: updatedDoc.show.name,
      updatedAt: new Date().toISOString(),
      document: updatedDoc,
    });

    // Schedule cloud sync via the sync layer
    if (syncedStorage) {
      syncedStorage.saveShow({
        id: showId,
        name: updatedDoc.show.name,
        updatedAt: new Date().toISOString(),
        document: updatedDoc,
      });
    }
  }
</script>

<svelte:head>
  <title>{doc?.show.name ?? data.showTitle ?? "Show"} - Rehearsal Block</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Playfair+Display:wght@400;600;700&family=Roboto:wght@400;500;700&family=Lato:wght@400;700&family=Merriweather:wght@400;700&family=Open+Sans:wght@400;600;700&family=Questrial&display=swap" />
</svelte:head>

{#if loading}
  <div class="loading-state">
    <p>Loading show...</p>
  </div>
{:else if loadError}
  <div class="error-state">
    <h2>Could not load show</h2>
    <p>{loadError}</p>
    <a href="/app" class="btn btn-primary">Back to My Shows</a>
  </div>
{:else if doc}
  <ScheduleEditor
    initialDoc={doc}
    readOnly={false}
    onSave={handleSave}
    onDocChange={handleDocChange}
  />
{/if}

<style>
  .loading-state,
  .error-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 400px;
    text-align: center;
    gap: var(--space-4);
    color: var(--color-text-muted);
  }

  .error-state h2 {
    margin: 0;
    color: var(--color-text);
  }

  .error-state p {
    margin: 0;
    max-width: 400px;
  }
</style>
