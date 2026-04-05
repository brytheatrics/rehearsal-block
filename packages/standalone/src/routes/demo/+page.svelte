<script lang="ts">
  import { PaywallError } from "$lib/storage";
  import { demoStorage } from "$lib/storage/demo";

  let { data } = $props();

  // $derived wraps the prop access reactively — unlike a plain destructure,
  // which would snapshot the initial value only.
  const show = $derived(data.show);
  const scheduleEntries = $derived(
    Object.entries(show.schedule).sort(([a], [b]) => a.localeCompare(b))
  );

  let paywallOpen = $state(false);

  async function tryToSave() {
    try {
      await demoStorage.saveShow({
        id: "demo",
        name: show.show.name,
        updatedAt: new Date().toISOString(),
        document: show,
      });
    } catch (err) {
      if (err instanceof PaywallError) {
        paywallOpen = true;
      } else {
        throw err;
      }
    }
  }

  async function tryToExport() {
    // Same as save — export is also gated behind payment
    try {
      await demoStorage.saveShow({
        id: "demo",
        name: show.show.name,
        updatedAt: new Date().toISOString(),
        document: show,
      });
    } catch (err) {
      if (err instanceof PaywallError) {
        paywallOpen = true;
      } else {
        throw err;
      }
    }
  }

  function closePaywall() {
    paywallOpen = false;
  }

  function getEventType(id: string) {
    return show.eventTypes.find((t) => t.id === id);
  }

  function getCastName(id: string) {
    const c = show.cast.find((m) => m.id === id);
    return c ? c.firstName : id;
  }

  function getGroupName(id: string) {
    const g = show.groups.find((g) => g.id === id);
    return g ? g.name : id;
  }

  function formatDate(iso: string) {
    return new Date(iso + "T00:00:00").toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  }
</script>

<svelte:head>
  <title>Demo — Rehearsal Block</title>
</svelte:head>

<div class="demo-page container">
  <div class="demo-banner">
    <div class="banner-text">
      <strong>You're in demo mode.</strong> This is a sample show to explore the app.
      Any changes you make won't be saved.
    </div>
    <a href="/buy" class="btn btn-primary">Buy Rehearsal Block — $50</a>
  </div>

  <div class="show-header">
    <h1>{show.show.name}</h1>
    <p class="show-dates">
      {formatDate(show.show.startDate)} — {formatDate(show.show.endDate)}
    </p>
    <div class="show-actions">
      <button type="button" class="btn btn-primary" onclick={tryToSave}>Save</button>
      <button type="button" class="btn btn-secondary" onclick={tryToExport}>Export PDF</button>
    </div>
  </div>

  <div class="demo-panel">
    <div class="panel-header">
      <h2>Scheduler (coming soon)</h2>
      <p class="panel-note">
        The full calendar grid, day editor, and cast sidebar will appear here.
        This setup session wires up the infrastructure; the scheduler UI is built
        in the next session. Below is the sample show data, loaded from
        <code>@rehearsal-block/core</code>.
      </p>
    </div>

    <div class="sample-layout">
      <aside class="cast-sidebar">
        <h3>Cast ({show.cast.length})</h3>
        <ul class="cast-list">
          {#each show.cast as member (member.id)}
            <li class="cast-chip" style:border-left-color={member.color}>
              <span class="cast-name">{member.firstName}</span>
              <span class="cast-character">{member.character}</span>
            </li>
          {/each}
        </ul>

        {#if show.groups.length > 0}
          <h3>Groups</h3>
          <ul class="groups-list">
            {#each show.groups as group (group.id)}
              <li>
                <strong>{group.name}</strong>
                <span class="group-count">({group.memberIds.length})</span>
              </li>
            {/each}
          </ul>
        {/if}
      </aside>

      <section class="schedule-preview">
        <h3>Scheduled Days ({scheduleEntries.length})</h3>
        {#each scheduleEntries as [date, day] (date)}
          {@const eventType = getEventType(day.eventTypeId)}
          <article class="day-card">
            <header class="day-header">
              <div class="day-date">{formatDate(date)}</div>
              {#if eventType}
                <span
                  class="day-badge"
                  style:background={eventType.bgColor}
                  style:color={eventType.textColor}
                >
                  {eventType.name}
                </span>
              {/if}
            </header>
            {#if day.description}
              <p class="day-description">{day.description}</p>
            {/if}
            {#if day.calls.length > 0}
              <ul class="day-calls">
                {#each day.calls as call (call.id)}
                  <li>
                    <strong>{call.time}{call.endTime ? `–${call.endTime}` : ""}</strong>
                    {#if call.label}— {call.label}{/if}
                    {#if call.calledActorIds.length > 0}
                      · {call.calledActorIds.map(getCastName).join(", ")}
                    {/if}
                    {#if call.calledGroupIds.length > 0}
                      · {call.calledGroupIds.map(getGroupName).join(", ")}
                    {/if}
                  </li>
                {/each}
              </ul>
            {/if}
            {#if day.location}
              <div class="day-location">@ {day.location}</div>
            {/if}
          </article>
        {/each}
      </section>
    </div>
  </div>
</div>

{#if paywallOpen}
  <div class="modal-backdrop" role="button" tabindex="0" onclick={closePaywall} onkeydown={(e) => e.key === "Escape" && closePaywall()}>
    <div class="modal" role="dialog" aria-modal="true" tabindex="-1" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()}>
      <h2>Buy Rehearsal Block to continue</h2>
      <p>
        Saving and exporting your schedule requires a paid account. Rehearsal Block is a
        one-time $50 purchase — no subscription, no recurring fees, unlimited shows forever.
      </p>
      <div class="modal-actions">
        <button type="button" class="btn btn-secondary" onclick={closePaywall}>Keep exploring</button>
        <a href="/buy" class="btn btn-primary">Buy Rehearsal Block</a>
      </div>
    </div>
  </div>
{/if}

<style>
  .demo-page {
    max-width: 1200px;
  }

  .demo-banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-4);
    background: var(--color-info-bg);
    border: 1px solid var(--color-teal);
    border-radius: var(--radius-md);
    padding: var(--space-4) var(--space-5);
    margin-bottom: var(--space-6);
  }

  .banner-text {
    color: var(--color-plum);
  }

  .show-header {
    margin-bottom: var(--space-6);
  }

  .show-dates {
    color: var(--color-text-muted);
    font-size: 1.125rem;
    margin-bottom: var(--space-4);
  }

  .show-actions {
    display: flex;
    gap: var(--space-2);
  }

  .demo-panel {
    background: var(--color-bg-alt);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    padding: var(--space-5);
  }

  .panel-header h2 {
    font-size: 1.25rem;
    color: var(--color-text-muted);
    margin-bottom: var(--space-2);
  }

  .panel-note {
    font-size: 0.875rem;
    color: var(--color-text-muted);
    margin-bottom: var(--space-5);
  }

  .panel-note code {
    font-family: var(--font-mono);
    font-size: 0.8125rem;
    background: var(--color-bg);
    padding: 1px var(--space-1);
    border-radius: var(--radius-sm);
  }

  .sample-layout {
    display: grid;
    grid-template-columns: 260px 1fr;
    gap: var(--space-5);
  }

  .cast-sidebar h3 {
    font-size: 1rem;
    color: var(--color-plum);
    margin-top: var(--space-5);
    margin-bottom: var(--space-3);
  }
  .cast-sidebar h3:first-child {
    margin-top: 0;
  }

  .cast-list,
  .groups-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .cast-chip {
    padding: var(--space-2) var(--space-3);
    background: var(--color-surface);
    border-left: 4px solid;
    border-radius: var(--radius-sm);
    display: flex;
    flex-direction: column;
    font-size: 0.875rem;
  }

  .cast-name {
    font-weight: 600;
    color: var(--color-text);
  }

  .cast-character {
    color: var(--color-text-muted);
    font-size: 0.75rem;
  }

  .groups-list li {
    font-size: 0.875rem;
    color: var(--color-text);
  }

  .group-count {
    color: var(--color-text-subtle);
    font-size: 0.75rem;
  }

  .schedule-preview h3 {
    font-size: 1rem;
    color: var(--color-plum);
    margin-top: 0;
    margin-bottom: var(--space-3);
  }

  .day-card {
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    padding: var(--space-3) var(--space-4);
    margin-bottom: var(--space-3);
  }

  .day-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--space-2);
  }

  .day-date {
    font-weight: 600;
    color: var(--color-plum);
  }

  .day-badge {
    padding: 2px var(--space-2);
    border-radius: var(--radius-sm);
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  .day-description {
    color: var(--color-text);
    margin: 0 0 var(--space-2) 0;
    font-weight: 500;
  }

  .day-calls {
    list-style: none;
    padding: 0;
    margin: 0 0 var(--space-2) 0;
    font-size: 0.875rem;
    color: var(--color-text-muted);
  }

  .day-calls li {
    margin-bottom: var(--space-1);
  }

  .day-location {
    font-size: 0.75rem;
    color: var(--color-text-subtle);
    font-style: italic;
  }

  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(45, 31, 61, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
    padding: var(--space-4);
    border: none;
    cursor: pointer;
  }

  .modal {
    background: var(--color-surface);
    border-radius: var(--radius-lg);
    padding: var(--space-6);
    max-width: 480px;
    width: 100%;
    box-shadow: var(--shadow-lg);
    cursor: default;
  }

  .modal h2 {
    margin-top: 0;
    color: var(--color-plum);
  }

  .modal-actions {
    display: flex;
    gap: var(--space-2);
    justify-content: flex-end;
    margin-top: var(--space-5);
  }

  @media (max-width: 800px) {
    .sample-layout {
      grid-template-columns: 1fr;
    }
    .demo-banner {
      flex-direction: column;
      align-items: stretch;
      text-align: center;
    }
  }
</style>
