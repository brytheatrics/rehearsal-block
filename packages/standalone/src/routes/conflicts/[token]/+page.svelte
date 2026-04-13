<script lang="ts">
  /**
   * Actor-facing conflict submission page - single-link mode.
   *
   * Fetches the show snapshot from the API (backed by R2), then
   * renders the ConflictSubmitter for the actor to pick their
   * conflicts. Falls back to localStorage for same-device testing.
   */
  import type { ScheduleDoc } from "@rehearsal-block/core";
  import { page } from "$app/state";
  import { onMount } from "svelte";
  import ConflictSubmitter from "$lib/components/scheduler/ConflictSubmitter.svelte";

  const token = $derived(page.params.token ?? "");

  let show = $state<ScheduleDoc | null>(null);
  let loadError = $state<string | null>(null);

  async function loadShow() {
    if (!token) {
      loadError = "Missing token in URL.";
      return;
    }
    try {
      // Try API first (R2-backed, works cross-device)
      const res = await fetch(`/api/conflict-share?token=${encodeURIComponent(token)}`);
      if (res.ok) {
        const data = await res.json();
        show = data.doc;
        loadError = null;
        return;
      }
    } catch { /* API unavailable, fall through */ }

    // Fallback: localStorage (same-device testing)
    try {
      const key = `rehearsal-block:conflict-show:${token}`;
      const raw = localStorage.getItem(key);
      if (!raw) {
        loadError = "This conflict link was not found. It may have expired or the director hasn't published it yet.";
        return;
      }
      const parsed = JSON.parse(raw) as ScheduleDoc;
      if (!parsed?.show || !Array.isArray(parsed.cast)) {
        loadError = "The show data for this link is corrupted.";
        return;
      }
      show = parsed;
      loadError = null;
    } catch {
      loadError = "Could not load this link. Please ask the director to resend it.";
    }
  }

  onMount(() => {
    loadShow();
  });
</script>

<svelte:head>
  <title>Submit conflicts{show ? ` - ${show.show.name}` : ""}</title>
</svelte:head>

{#if loadError}
  <div class="error-page">
    <div class="error-card">
      <h1>Link not available</h1>
      <p>{loadError}</p>
    </div>
  </div>
{:else if show}
  <ConflictSubmitter {show} actorId={null} {token} />
{:else}
  <div class="loading">Loading...</div>
{/if}

<style>
  .error-page {
    min-height: 100vh;
    background: var(--color-bg-alt);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-4);
  }
  .error-card {
    max-width: 480px;
    padding: var(--space-6) var(--space-5);
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    text-align: center;
  }
  .error-card h1 {
    font-family: var(--font-display, inherit);
    font-size: 1.5rem;
    color: var(--color-plum);
    margin: 0 0 var(--space-2);
  }
  .error-card p {
    font-size: 0.9375rem;
    color: var(--color-text-muted);
    line-height: 1.5;
    margin: 0;
  }
  .loading {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--color-text-muted);
    font-size: 0.875rem;
  }
</style>
