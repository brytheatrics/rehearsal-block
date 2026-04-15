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
  import EditShowModal from "$lib/components/app/EditShowModal.svelte";
  import RevisionHistoryModal from "$lib/components/app/RevisionHistoryModal.svelte";
  import { listShowsMeta, type ShowIndexRow } from "$lib/storage/index.js";
  import { localListShows, localSaveShow, localDeleteShow, localLoadShow } from "$lib/storage/local.js";
  import type { StoredShow } from "$lib/storage/types.js";

  let { data } = $props();

  /* Display name preference: user_metadata.full_name (OAuth) > user_metadata.name
     > first segment of full_name > capitalized email local-part. "'s Shows" is
     appended in the header markup. */
  const displayName = $derived.by(() => {
    const meta = (data.user as { user_metadata?: Record<string, unknown> } | undefined)?.user_metadata;
    const full = typeof meta?.full_name === "string" ? meta.full_name.trim() : "";
    const name = typeof meta?.name === "string" ? meta.name.trim() : "";
    const firstName = (full || name).split(/\s+/)[0] ?? "";
    if (firstName) return firstName;
    const local = data.user?.email?.split("@")[0] ?? "My";
    return local.charAt(0).toUpperCase() + local.slice(1);
  });

  let newShowOpen = $state(false);
  let defaultsOpen = $state(false);
  let editShowId = $state<string | null>(null);
  let historyShowId = $state<string | null>(null);
  let showArchived = $state(false);
  let loading = $state(true);
  let importInput: HTMLInputElement | undefined = $state();
  let toastMessage = $state("");
  let deleteConfirmId = $state<string | null>(null);

  function showToast(msg: string) {
    toastMessage = msg;
    setTimeout(() => (toastMessage = ""), 3000);
  }

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
  /** Full docs cached in IndexedDB - used to compute "this week rehearsals". */
  let fullDocs = $state<Map<string, StoredShow>>(new Map());

  // ---- Dashboard computation ----

  function daysBetween(a: string, b: string): number {
    const d1 = new Date(a + "T00:00:00Z");
    const d2 = new Date(b + "T00:00:00Z");
    return Math.round((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24));
  }

  function todayIso(): string {
    return new Date().toISOString().slice(0, 10);
  }

  function weekEndIso(): string {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().slice(0, 10);
  }

  /** Next upcoming event across all shows. Earliest scheduled day with
   *  content (calls, description, or notes) from any active show. When
   *  multiple shows have events on the same date, they all show. */
  const nextEvents = $derived.by(() => {
    const today = todayIso();
    type Event = {
      showId: string;
      showName: string;
      date: string;
      eventType: string;
      callTime: string;
      description: string;
    };

    const events: Event[] = [];

    for (const show of shows) {
      if (show.archived) continue;
      const doc = fullDocs.get(show.id);
      if (!doc) continue;

      const schedule = doc.document.schedule ?? {};
      const eventTypes = doc.document.eventTypes ?? [];

      for (const [date, day] of Object.entries(schedule)) {
        if (!day) continue;
        if (date < today) continue;

        const hasContent = (day.calls && day.calls.length > 0) || day.description || day.notes;
        if (!hasContent) continue;

        const eventTypeName = eventTypes.find((t) => t.id === day.eventTypeId)?.name ?? "";
        const firstCall = day.calls?.[0];
        const callTime = firstCall?.time ?? "";

        events.push({
          showId: show.id,
          showName: show.name,
          date,
          eventType: eventTypeName,
          callTime,
          description: day.description ?? "",
        });
      }
    }

    events.sort((a, b) => {
      const dateCmp = a.date.localeCompare(b.date);
      if (dateCmp !== 0) return dateCmp;
      return a.callTime.localeCompare(b.callTime);
    });

    if (events.length === 0) return [];

    // Return ALL events on the earliest date (handles co-occurring events)
    const firstDate = events[0]!.date;
    return events.filter((e) => e.date === firstDate);
  });

  function formatTime12(time: string): string {
    if (!time) return "";
    const [h, m] = time.split(":").map(Number);
    if (h === undefined || m === undefined) return time;
    const hour = h % 12 || 12;
    const ampm = h < 12 ? "AM" : "PM";
    return `${hour}:${String(m).padStart(2, "0")} ${ampm}`;
  }

  /** Shows opening in the next 30 days. */
  const openingSoon = $derived(
    shows
      .filter((s) => !s.archived && s.startDate)
      .filter((s) => {
        const days = daysBetween(todayIso(), s.startDate!);
        return days > 0 && days <= 30;
      })
      .sort((a, b) => (a.startDate ?? "").localeCompare(b.startDate ?? "")),
  );

  /** Shows closing in the next 14 days (end date). */
  const closingSoon = $derived(
    shows
      .filter((s) => !s.archived && s.endDate)
      .filter((s) => {
        const days = daysBetween(todayIso(), s.endDate!);
        return days >= 0 && days <= 14;
      })
      .sort((a, b) => (a.endDate ?? "").localeCompare(b.endDate ?? "")),
  );

  /** Rehearsals across all active shows happening in the next 7 days. */
  const thisWeekRehearsals = $derived.by(() => {
    const today = todayIso();
    const weekEnd = weekEndIso();
    const rehearsals: Array<{ showId: string; showName: string; date: string; dayCount: number }> = [];

    for (const show of shows) {
      if (show.archived) continue;
      const doc = fullDocs.get(show.id);
      if (!doc) continue;
      const schedule = doc.document.schedule ?? {};
      for (const [date, day] of Object.entries(schedule)) {
        if (!day) continue;
        if (date < today || date > weekEnd) continue;
        const hasContent = (day.calls && day.calls.length > 0) || day.description || day.notes;
        if (!hasContent) continue;
        rehearsals.push({
          showId: show.id,
          showName: show.name,
          date,
          dayCount: day.calls?.length ?? 0,
        });
      }
    }

    return rehearsals.sort((a, b) => a.date.localeCompare(b.date));
  });

  function formatShortDate(iso: string): string {
    const d = new Date(iso + "T00:00:00Z");
    return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
  }

  function formatRelativeDate(iso: string): string {
    const days = daysBetween(todayIso(), iso);
    if (days === 0) return "Today";
    if (days === 1) return "Tomorrow";
    if (days === -1) return "Yesterday";
    if (days > 0 && days <= 7) return `In ${days} days`;
    if (days < 0 && days >= -7) return `${-days} days ago`;
    const d = new Date(iso + "T00:00:00Z");
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  }

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

    // Load full docs from IndexedDB for dashboard "this week" computation.
    // Missing docs are OK - the section just won't count those shows.
    const docMap = new Map<string, StoredShow>();
    for (const show of shows) {
      try {
        const doc = await localLoadShow(show.id);
        if (doc) docMap.set(show.id, doc);
      } catch { /* ignore */ }
    }
    fullDocs = docMap;

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
      handleUnarchiveAndOpen(id);
    } else {
      goto(`/app/${id}`);
    }
  }

  function handleEdit(id: string) {
    editShowId = id;
  }

  function handleHistory(id: string) {
    historyShowId = id;
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

  async function handleCreate(rawDoc: ScheduleDoc) {
    const id = crypto.randomUUID();
    // Strip Svelte 5 reactive proxies - IndexedDB's structured clone chokes on them
    const doc: ScheduleDoc = JSON.parse(JSON.stringify(rawDoc));

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
      showToast("Failed to create show. Please try again.");
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
      showToast("Failed to duplicate show. Please try again.");
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
      showToast("Failed to export show. Please try again.");
    }
  }

  function handleDelete(id: string) {
    deleteConfirmId = id;
  }

  async function confirmDelete() {
    const id = deleteConfirmId;
    if (!id) return;
    deleteConfirmId = null;
    try {
      if (!isLocalhost) {
        await fetch(`/api/shows/${id}`, { method: "DELETE" });
      }
      await localDeleteShow(id);
      shows = shows.filter((s) => s.id !== id);
    } catch (err) {
      console.error("Failed to delete:", err);
      showToast("Failed to delete show. Please try again.");
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
      showToast("Failed to import show. Make sure this is a valid Rehearsal Block JSON file.");
    }

    // Reset input so re-importing the same file triggers change
    input.value = "";
  }
</script>

<svelte:head>
  <title>My Shows - Rehearsal Block</title>
</svelte:head>

<div class="shows-page container" class:is-empty={shows.length === 0 && !loading}>
  <header class="page-header">
    <div>
      <h1>{displayName}'s Shows</h1>
    </div>
    <div class="header-actions">
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
        title="Import a previously exported .json show file"
        onclick={handleImport}
      >
        Import Show
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
  {:else if shows.length === 0}
    <div class="empty-hero">
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
          title="Import a previously exported .json show file"
          onclick={handleImport}
        >
          Import Show File
        </button>
      </div>
    </div>
  {:else}
    <div class="dashboard">
      <!-- Main content: magazine-style show grid -->
      <main class="show-grid-wrap">
        {#if visibleShows.length === 0}
          <div class="muted-state">
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
          <div class="magazine-grid">
            {#each visibleShows as show, idx (show.id)}
              <div class="mag-cell">
                <ShowCard
                  id={show.id}
                  name={show.name}
                  startDate={show.startDate ?? ""}
                  endDate={show.endDate ?? ""}
                  castCount={show.castCount}
                  updatedAt={show.updatedAt}
                  archived={show.archived}
                  onopen={handleOpen}
                  onedit={handleEdit}
                  onarchive={handleArchive}
                  onduplicate={handleDuplicate}
                  ondelete={handleDelete}
                  onexport={handleExport}
                  onhistory={handleHistory}
                />
              </div>
            {/each}
          </div>
        {/if}

        {#if archivedCount > 0}
          <div class="archived-footer">
            <button
              type="button"
              class="archived-link"
              onclick={() => (showArchived = !showArchived)}
            >
              {showArchived ? "Hide archived" : `Show ${archivedCount} archived`}
            </button>
          </div>
        {/if}
      </main>

      <!-- Right sidebar: dashboard -->
      <aside class="dashboard-sidebar">
        <section class="sb-section">
          <h3>Next event</h3>
          {#if nextEvents.length === 0}
            <p class="sb-empty">Nothing scheduled yet</p>
          {:else}
            <p class="sb-summary">{formatRelativeDate(nextEvents[0].date)} · {formatShortDate(nextEvents[0].date)}</p>
            <ul class="sb-list">
              {#each nextEvents as evt (evt.showId + evt.date + evt.callTime)}
                <li>
                  <a href="/app/{evt.showId}" class="sb-item">
                    <span class="sb-item-title">{evt.showName}</span>
                    <span class="sb-item-meta">
                      {#if evt.callTime}{formatTime12(evt.callTime)}{/if}
                      {#if evt.callTime && evt.eventType} · {/if}
                      {#if evt.eventType}{evt.eventType}{/if}
                    </span>
                  </a>
                </li>
              {/each}
            </ul>
          {/if}
        </section>

        <section class="sb-section">
          <h3>This week</h3>
          {#if thisWeekRehearsals.length === 0}
            <p class="sb-empty">Nothing scheduled this week</p>
          {:else}
            <p class="sb-summary">{thisWeekRehearsals.length} rehearsal{thisWeekRehearsals.length === 1 ? "" : "s"} scheduled</p>
            <ul class="sb-list sb-list-compact">
              {#each thisWeekRehearsals.slice(0, 5) as r}
                <li>
                  <a href="/app/{r.showId}" class="sb-item sb-item-small">
                    <span class="sb-item-title-row">
                      <span class="sb-date">{formatShortDate(r.date)}</span>
                      <span class="sb-item-title-sm">{r.showName}</span>
                    </span>
                  </a>
                </li>
              {/each}
            </ul>
            {#if thisWeekRehearsals.length > 5}
              <p class="sb-more">+ {thisWeekRehearsals.length - 5} more</p>
            {/if}
          {/if}
        </section>

        <section class="sb-section">
          <h3>Opening soon</h3>
          {#if openingSoon.length === 0}
            <p class="sb-empty">Nothing opening in the next 30 days</p>
          {:else}
            <ul class="sb-list">
              {#each openingSoon as show (show.id)}
                <li>
                  <a href="/app/{show.id}" class="sb-item">
                    <span class="sb-item-title">{show.name}</span>
                    <span class="sb-item-meta">Opens {formatRelativeDate(show.startDate!)}</span>
                  </a>
                </li>
              {/each}
            </ul>
          {/if}
        </section>

        <section class="sb-section">
          <h3>Closing soon</h3>
          {#if closingSoon.length === 0}
            <p class="sb-empty">Nothing closing in the next 14 days</p>
          {:else}
            <ul class="sb-list">
              {#each closingSoon as show (show.id)}
                <li>
                  <a href="/app/{show.id}" class="sb-item">
                    <span class="sb-item-title">{show.name}</span>
                    <span class="sb-item-meta">Closes {formatRelativeDate(show.endDate!)}</span>
                  </a>
                </li>
              {/each}
            </ul>
          {/if}
        </section>
      </aside>
    </div>
  {/if}
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

{#if editShowId}
  <EditShowModal
    showId={editShowId}
    onclose={() => (editShowId = null)}
    onsaved={loadShows}
  />
{/if}

{#if historyShowId}
  {@const hShow = shows.find(s => s.id === historyShowId)}
  <RevisionHistoryModal
    showId={historyShowId}
    showName={hShow?.name ?? "Show"}
    onclose={() => (historyShowId = null)}
    onrestored={loadShows}
  />
{/if}

{#if deleteConfirmId}
  {@const showName = shows.find(s => s.id === deleteConfirmId)?.name ?? "this show"}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="confirm-backdrop" onclick={() => (deleteConfirmId = null)}></div>
  <div class="confirm-modal" role="dialog" aria-modal="true">
    <h3>Delete show</h3>
    <p>Permanently delete <strong>{showName}</strong>? This can't be undone.</p>
    <div class="confirm-actions">
      <button type="button" class="confirm-cancel" onclick={() => (deleteConfirmId = null)}>Cancel</button>
      <button type="button" class="confirm-delete" onclick={confirmDelete}>Delete</button>
    </div>
  </div>
{/if}

{#if toastMessage}
  <div class="toast" role="status" aria-live="polite">
    {toastMessage}
  </div>
{/if}

<style>
  .shows-page {
    max-width: 1400px;
    position: relative;
  }

  /* ---- Dashboard layout: grid + sidebar ---- */
  .dashboard {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 300px;
    gap: var(--space-6);
    align-items: start;
  }

  @media (max-width: 1024px) {
    .dashboard {
      grid-template-columns: 1fr;
    }
  }

  /* ---- Magazine-style show grid ---- */
  .magazine-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--space-4);
  }

  .mag-cell {
    display: flex;
  }
  .mag-cell :global(.show-card) {
    flex: 1;
    border-radius: var(--radius-md);
  }

  @media (max-width: 600px) {
    .magazine-grid {
      grid-template-columns: 1fr;
    }
  }

  /* ---- Right sidebar ---- */
  .dashboard-sidebar {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    position: sticky;
    top: var(--space-5);
  }

  @media (max-width: 1024px) {
    .dashboard-sidebar {
      position: static;
    }
  }

  .sb-section {
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    padding: var(--space-3) var(--space-4);
  }

  .sb-section h3 {
    font-size: 0.6875rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--color-teal);
    margin: 0 0 var(--space-2);
  }

  .sb-empty {
    font-size: 0.8125rem;
    color: var(--color-text-subtle);
    font-style: italic;
    margin: 0;
  }

  .sb-summary {
    font-size: 0.8125rem;
    color: var(--color-text-muted);
    margin: 0 0 var(--space-2);
  }

  .sb-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .sb-list-compact {
    gap: 2px;
  }

  .sb-item {
    display: flex;
    flex-direction: column;
    padding: var(--space-2) 0;
    color: var(--color-text);
    text-decoration: none;
    border-bottom: 1px solid var(--color-border);
  }
  .sb-list li:last-child .sb-item {
    border-bottom: none;
  }
  .sb-item:hover {
    color: var(--color-teal);
    text-decoration: none;
  }

  .sb-item-title {
    font-size: 0.875rem;
    font-weight: 600;
    line-height: 1.3;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .sb-item-meta {
    font-size: 0.75rem;
    color: var(--color-text-muted);
    margin-top: 2px;
  }

  .sb-item-small {
    padding: var(--space-1) 0;
    border-bottom: none;
  }

  .sb-item-title-row {
    display: flex;
    gap: var(--space-2);
    align-items: baseline;
    font-size: 0.8125rem;
  }

  .sb-date {
    font-weight: 700;
    color: var(--color-plum);
    font-family: var(--font-display);
    flex-shrink: 0;
    width: 70px;
  }

  .sb-item-title-sm {
    color: var(--color-text-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .sb-more {
    font-size: 0.75rem;
    color: var(--color-text-subtle);
    margin: var(--space-1) 0 0;
  }

  /* ---- Empty state (no shows yet) ---- */
  .empty-hero {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    padding: var(--space-8) var(--space-5);
    gap: var(--space-4);
  }

  .empty-hero h2 {
    font-family: var(--font-display);
    font-size: 2rem;
    color: var(--color-plum);
    margin: 0;
  }

  .empty-hero p {
    max-width: 460px;
    color: var(--color-text-muted);
    line-height: 1.6;
    margin: 0;
    font-size: 1rem;
  }

  .empty-actions {
    display: flex;
    gap: var(--space-3);
    align-items: center;
    flex-wrap: wrap;
    justify-content: center;
    margin-top: var(--space-3);
  }

  /* ---- Archived footer link ---- */
  .archived-footer {
    margin-top: var(--space-5);
    text-align: center;
  }

  .archived-link {
    font: inherit;
    font-size: 0.8125rem;
    color: var(--color-text-muted);
    background: none;
    border: none;
    cursor: pointer;
    text-decoration: underline;
    text-underline-offset: 3px;
    padding: var(--space-2);
  }
  .archived-link:hover {
    color: var(--color-plum);
  }

  .muted-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    padding: var(--space-6) var(--space-5);
    gap: var(--space-3);
    color: var(--color-text-muted);
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
    font-size: 2.5rem;
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

  /* ---- Delete confirmation modal ---- */
  .confirm-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(45, 31, 61, 0.6);
    z-index: 1000;
  }

  .confirm-modal {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 400px;
    max-width: calc(100vw - 2 * var(--space-4));
    background: var(--color-surface);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-lg);
    z-index: 1010;
    padding: var(--space-5);
  }

  .confirm-modal h3 {
    margin: 0 0 var(--space-2);
    font-size: 1rem;
    font-weight: 700;
    color: var(--color-text);
  }

  .confirm-modal p {
    margin: 0 0 var(--space-5);
    font-size: 0.875rem;
    color: var(--color-text-muted);
    line-height: 1.5;
  }

  .confirm-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2);
  }

  .confirm-cancel {
    font: inherit;
    font-size: 0.8125rem;
    padding: var(--space-2) var(--space-4);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--color-text-muted);
    cursor: pointer;
  }
  .confirm-cancel:hover {
    color: var(--color-text);
    border-color: var(--color-text-muted);
  }

  .confirm-delete {
    font: inherit;
    font-size: 0.8125rem;
    font-weight: 600;
    padding: var(--space-2) var(--space-4);
    border: none;
    border-radius: var(--radius-sm);
    background: var(--color-danger);
    color: #fff;
    cursor: pointer;
  }
  .confirm-delete:hover {
    background: #b71c1c;
  }

  /* ---- Toast ---- */
  .toast {
    position: fixed;
    bottom: var(--space-5);
    left: 50%;
    transform: translateX(-50%);
    background: var(--color-plum);
    color: var(--color-text-inverse);
    padding: var(--space-2) var(--space-5);
    border-radius: var(--radius-full);
    font-size: 0.8125rem;
    font-weight: 500;
    box-shadow: var(--shadow-lg);
    z-index: 2000;
    animation: toast-in 200ms ease;
  }
  @keyframes toast-in {
    from { opacity: 0; transform: translateX(-50%) translateY(8px); }
    to { opacity: 1; transform: translateX(-50%) translateY(0); }
  }
</style>
