<script lang="ts">
  /**
   * Actor-facing conflict submission page - per-role mode.
   *
   * Same as the single-link route, but the id in the URL is matched
   * against both cast and crew so the person is pre-selected (no dropdown).
   *
   * The id slice in the URL is the first 6 characters of the member id,
   * matching what ConflictRequestModal generates for per-role links. We
   * match by slice prefix since random UUIDs make collisions effectively
   * impossible at that length.
   */
  import type { ScheduleDoc, CastMember, CrewMember } from "@rehearsal-block/core";
  import { page } from "$app/state";
  import { onMount } from "svelte";
  import ConflictSubmitter from "$lib/components/scheduler/ConflictSubmitter.svelte";

  type Member = CastMember | CrewMember;

  const token = $derived(page.params.token ?? "");
  const actorIdSlice = $derived(page.params.actorId ?? "");

  let show = $state<ScheduleDoc | null>(null);
  let matchedActor = $state<Member | null>(null);
  let loadError = $state<string | null>(null);

  async function loadShow() {
    if (!token) {
      loadError = "Missing token in URL.";
      return;
    }

    let parsed: ScheduleDoc | null = null;

    // Try API first (R2-backed, works cross-device)
    try {
      const res = await fetch(`/api/conflict-share?token=${encodeURIComponent(token)}`);
      if (res.ok) {
        const data = await res.json();
        parsed = data.doc;
      }
    } catch { /* fall through */ }

    // Fallback: localStorage (same-device testing)
    if (!parsed) {
      try {
        const key = `rehearsal-block:conflict-show:${token}`;
        const raw = localStorage.getItem(key);
        if (raw) parsed = JSON.parse(raw) as ScheduleDoc;
      } catch { /* ignore */ }
    }

    if (!parsed?.show || !Array.isArray(parsed.cast) || !Array.isArray(parsed.crew)) {
      loadError = "This conflict link was not found. It may have expired or the director hasn't published it yet.";
      return;
    }

    show = parsed;
    const found: Member | undefined =
      (parsed.cast as Member[]).find((m) => m.id.startsWith(actorIdSlice)) ??
      (parsed.crew as Member[]).find((m) => m.id.startsWith(actorIdSlice));
    if (!found) {
      loadError = "This per-role link doesn't match anyone in the cast or production team. The director may have removed you or regenerated the links.";
      return;
    }
    matchedActor = found;
    loadError = null;
  }

  onMount(() => {
    loadShow();
  });
</script>

<svelte:head>
  <title>Submit conflicts{show && matchedActor ? ` - ${matchedActor.firstName} ${matchedActor.lastName}` : ""}</title>
</svelte:head>

{#if loadError}
  <div class="error-page">
    <div class="error-card">
      <h1>Link not available</h1>
      <p>{loadError}</p>
    </div>
  </div>
{:else if show && matchedActor}
  <ConflictSubmitter {show} actorId={matchedActor.id} {token} />
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
