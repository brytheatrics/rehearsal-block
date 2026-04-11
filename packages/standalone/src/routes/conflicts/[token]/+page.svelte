<script lang="ts">
  /**
   * Actor-facing conflict submission page - single-link mode.
   *
   * Flow:
   * 1. Director opens ConflictRequestModal, which writes the current show
   *    doc to localStorage keyed by token.
   * 2. Director sends this URL to their cast.
   * 3. Actor opens it in any browser tab on the same device, sees the
   *    calendar, picks their name from a dropdown, adds conflicts, submits.
   *
   * Token resolution: deterministic hash of show.name + startDate, same
   * as the one the modal computes (see hashString() in that file).
   *
   * NOTE: this is a local-testing implementation. In production (Priority 2),
   * the token lookup will hit Supabase via the conflict_share_token column
   * on the shows table, and this route will work cross-device.
   */
  import type { ScheduleDoc } from "@rehearsal-block/core";
  import { page } from "$app/state";
  import { onMount } from "svelte";
  import ConflictSubmitter from "$lib/components/scheduler/ConflictSubmitter.svelte";

  const token = $derived(page.params.token ?? "");

  let show = $state<ScheduleDoc | null>(null);
  let loadError = $state<string | null>(null);

  function loadShow() {
    if (!token) {
      loadError = "Missing token in URL.";
      return;
    }
    try {
      const key = `rehearsal-block:conflict-show:${token}`;
      const raw = localStorage.getItem(key);
      if (!raw) {
        loadError =
          "This conflict request link hasn't been opened by the director yet, or it was created in a different browser. Local testing only works in the same browser.";
        return;
      }
      const parsed = JSON.parse(raw) as ScheduleDoc;
      if (!parsed || !parsed.show || !Array.isArray(parsed.cast)) {
        loadError = "The show data for this link is corrupted.";
        return;
      }
      show = parsed;
      loadError = null;
    } catch (err) {
      loadError = "Could not load this link. Please ask the director to resend it.";
      console.error(err);
    }
  }

  onMount(() => {
    loadShow();
    // If the director updates the show while this tab is open, refresh
    const key = `rehearsal-block:conflict-show:${token}`;
    const handler = (e: StorageEvent) => {
      if (e.key === key) loadShow();
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
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
