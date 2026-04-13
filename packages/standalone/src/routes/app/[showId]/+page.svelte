<script lang="ts">
  /**
   * Show editor page (/app/[showId]).
   *
   * Loads the document from IndexedDB (instant) with an API fallback,
   * then renders the shared ScheduleEditor. Every edit triggers an
   * auto-save to IndexedDB via the onDocChange callback.
   */
  import { onMount } from "svelte";
  import { browser } from "$app/environment";
  import type { ScheduleDoc } from "@rehearsal-block/core";
  import ScheduleEditor from "$lib/components/scheduler/ScheduleEditor.svelte";
  import { localLoadShow, localSaveShow } from "$lib/storage/local.js";
  import { createSyncedStorage, type SyncedStorage } from "$lib/storage/sync.js";
  import { createSupabaseBrowserClient } from "$lib/supabase/client.js";

  let { data } = $props();

  let syncedStorage: SyncedStorage | null = null;

  const isLocalhost = browser &&
    (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");

  // Use a promise for the {#await} block - Svelte handles reactivity natively
  let loadPromise = $state<Promise<ScheduleDoc>>(loadDoc());

  async function loadDoc(): Promise<ScheduleDoc> {
    if (!browser) {
      // SSR: return a never-resolving promise so the loading state shows
      return new Promise(() => {});
    }

    const showId = data.showId;

    // Try IndexedDB first
    try {
      const localShow = await localLoadShow(showId);
      if (localShow) return localShow.document;
    } catch { /* IndexedDB unavailable */ }

    // Fall back to API
    const res = await fetch(`/api/shows/${showId}`);
    if (!res.ok) {
      throw new Error(
        res.status === 404 ? "Show not found." : `Failed to load show (${res.status}).`,
      );
    }
    const show = await res.json();

    // Cache in IndexedDB
    localSaveShow({
      id: showId,
      name: show.name,
      updatedAt: show.updatedAt,
      document: show.document,
    }).catch(() => {});

    return show.document as ScheduleDoc;
  }

  onMount(() => {
    // Re-trigger load on mount in case the SSR promise was a no-op
    loadPromise = loadDoc();

    // Set up sync layer for cloud push (production only)
    if (!isLocalhost && data.user) {
      const supabase = createSupabaseBrowserClient();
      syncedStorage = createSyncedStorage({
        userId: data.user.id,
        supabase,
      });
    }

    return () => {
      syncedStorage?.destroy();
    };
  });

  async function handleSave(updatedDoc: ScheduleDoc) {
    const showId = data.showId;
    await localSaveShow({
      id: showId,
      name: updatedDoc.show.name,
      updatedAt: new Date().toISOString(),
      document: updatedDoc,
    });
    if (syncedStorage) await syncedStorage.flush(showId);
  }

  function handleDocChange(updatedDoc: ScheduleDoc) {
    const showId = data.showId;
    localSaveShow({
      id: showId,
      name: updatedDoc.show.name,
      updatedAt: new Date().toISOString(),
      document: updatedDoc,
    });
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
  <title>{data.showTitle ?? "Show"} - Rehearsal Block</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Playfair+Display:wght@400;600;700&family=Roboto:wght@400;500;700&family=Lato:wght@400;700&family=Merriweather:wght@400;700&family=Open+Sans:wght@400;600;700&family=Questrial&display=swap" />
</svelte:head>

{#await loadPromise}
  <div class="loading-state">
    <p>Loading show...</p>
  </div>
{:then doc}
  <ScheduleEditor
    initialDoc={doc}
    readOnly={false}
    onSave={handleSave}
    onDocChange={handleDocChange}
  />
{:catch err}
  <div class="error-state">
    <h2>Could not load show</h2>
    <p>{err.message}</p>
    <a href="/app" class="btn btn-primary">Back to My Shows</a>
  </div>
{/await}

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
