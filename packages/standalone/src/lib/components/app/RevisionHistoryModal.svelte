<script lang="ts">
  /**
   * Revision history modal. Lists the available daily snapshots from
   * R2 (up to 7 days, pruned by a cron) and lets the user restore one.
   * Restoring saves today's version as a snapshot first (so it's reversible).
   */
  import { onMount } from "svelte";
  import type { ScheduleDoc } from "@rehearsal-block/core";
  import { localSaveShow } from "$lib/storage/local.js";

  interface Props {
    showId: string;
    showName: string;
    onclose: () => void;
    /** Called after a successful restore so the parent can refresh state. */
    onrestored?: () => void;
  }

  const { showId, showName, onclose, onrestored }: Props = $props();

  let snapshots = $state<string[]>([]);
  let loading = $state(true);
  let loadError = $state<string | null>(null);
  let confirmDate = $state<string | null>(null);
  let restoring = $state(false);
  let restoreError = $state<string | null>(null);

  onMount(async () => {
    try {
      const res = await fetch(`/api/shows/${showId}/snapshots`);
      if (!res.ok) {
        loadError = "Could not load version history.";
        loading = false;
        return;
      }
      const data = await res.json();
      snapshots = data.snapshots ?? [];
    } catch {
      loadError = "Could not load version history.";
    }
    loading = false;
  });

  function formatDate(iso: string): string {
    const d = new Date(iso + "T00:00:00Z");
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = (() => {
      const y = new Date();
      y.setDate(y.getDate() - 1);
      return y.toISOString().slice(0, 10);
    })();
    const label = d.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      timeZone: "UTC",
    });
    if (iso === today) return `Today, ${label}`;
    if (iso === yesterday) return `Yesterday, ${label}`;
    return label;
  }

  async function handleRestore(date: string) {
    restoring = true;
    restoreError = null;
    try {
      const res = await fetch(`/api/shows/${showId}/restore`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date }),
      });
      if (!res.ok) {
        const msg = await res.text().catch(() => "Restore failed");
        throw new Error(msg);
      }
      const data = await res.json();
      // Update IndexedDB with the restored doc
      await localSaveShow({
        id: showId,
        name: data.name,
        updatedAt: data.updatedAt,
        document: data.document as ScheduleDoc,
      });
      onrestored?.();
      onclose();
    } catch (err: any) {
      restoreError = err.message || "Restore failed. Please try again.";
      restoring = false;
    }
  }

  function handleKey(e: KeyboardEvent) {
    if (e.key === "Escape") {
      if (confirmDate) confirmDate = null;
      else onclose();
    }
  }
</script>

<svelte:window onkeydown={handleKey} />

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="backdrop" onclick={onclose}></div>

<div class="modal" role="dialog" aria-labelledby="rev-history-title">
  <div class="modal-header">
    <div>
      <div class="eyebrow">Version history</div>
      <h2 id="rev-history-title">{showName}</h2>
    </div>
    <button type="button" class="close-btn" aria-label="Close" onclick={onclose}>&times;</button>
  </div>

  <p class="hint">
    Up to 7 daily snapshots, automatically saved on the first edit each day.
    Restoring replaces your current version, but today's version is saved
    in history first so you can restore it back.
  </p>

  <div class="content">
    {#if loading}
      <p class="loading">Loading versions...</p>
    {:else if loadError}
      <p class="error">{loadError}</p>
    {:else if snapshots.length === 0}
      <p class="empty">No earlier versions yet. Snapshots are created when you edit a show on different days.</p>
    {:else}
      <ul class="snapshot-list">
        {#each snapshots as date (date)}
          <li class="snapshot-row">
            <span class="snapshot-date">{formatDate(date)}</span>
            {#if confirmDate === date}
              <div class="confirm-actions">
                <button type="button" class="ghost-btn" onclick={() => (confirmDate = null)}>
                  Cancel
                </button>
                <button type="button" class="primary-btn" disabled={restoring} onclick={() => handleRestore(date)}>
                  {restoring ? "Restoring..." : "Yes, restore this version"}
                </button>
              </div>
            {:else}
              <button type="button" class="ghost-btn" onclick={() => (confirmDate = date)}>
                Restore
              </button>
            {/if}
          </li>
        {/each}
      </ul>
      {#if restoreError}
        <p class="error">{restoreError}</p>
      {/if}
    {/if}
  </div>

  <div class="modal-footer">
    <button type="button" class="ghost-btn" onclick={onclose}>Close</button>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(45, 31, 61, 0.6);
    z-index: 1000;
  }

  .modal {
    position: fixed;
    top: 5vh;
    left: 50%;
    transform: translateX(-50%);
    width: 520px;
    max-width: calc(100vw - 2 * var(--space-4));
    max-height: calc(100vh - 2 * var(--space-4));
    background: var(--color-surface);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-lg);
    z-index: 1010;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .modal-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    padding: var(--space-4) var(--space-5);
    border-bottom: 1px solid var(--color-border);
    flex-shrink: 0;
  }

  .eyebrow {
    font-size: 0.625rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--color-teal);
    margin-bottom: 2px;
  }

  .modal-header h2 {
    font-size: 1rem;
    font-weight: 700;
    margin: 0;
    color: var(--color-text);
  }

  .close-btn {
    background: transparent;
    border: none;
    font-size: 1.5rem;
    color: var(--color-text-muted);
    cursor: pointer;
    padding: 0;
    line-height: 1;
  }
  .close-btn:hover {
    color: var(--color-text);
  }

  .hint {
    font-size: 0.8125rem;
    color: var(--color-text-muted);
    line-height: 1.5;
    padding: var(--space-3) var(--space-5);
    margin: 0;
    flex-shrink: 0;
  }

  .content {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 0 var(--space-5) var(--space-3);
  }

  .loading, .empty, .error {
    font-size: 0.875rem;
    color: var(--color-text-muted);
    text-align: center;
    padding: var(--space-5);
    margin: 0;
  }

  .error {
    color: var(--color-danger);
  }

  .snapshot-list {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .snapshot-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    padding: var(--space-3) 0;
    border-bottom: 1px solid var(--color-border);
  }
  .snapshot-row:last-child {
    border-bottom: none;
  }

  .snapshot-date {
    font-size: 0.875rem;
    font-weight: 500;
  }

  .confirm-actions {
    display: flex;
    gap: var(--space-2);
  }

  .modal-footer {
    display: flex;
    justify-content: flex-end;
    padding: var(--space-3) var(--space-5);
    border-top: 1px solid var(--color-border);
    flex-shrink: 0;
  }

  .ghost-btn {
    font: inherit;
    font-size: 0.8125rem;
    padding: var(--space-2) var(--space-4);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--color-text-muted);
    cursor: pointer;
  }
  .ghost-btn:hover {
    color: var(--color-text);
    border-color: var(--color-text-muted);
  }

  .primary-btn {
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
  .primary-btn:hover {
    background: var(--color-plum-dark);
  }
  .primary-btn:disabled {
    opacity: 0.6;

  }
</style>
