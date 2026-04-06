<script lang="ts">
  /**
   * Date range editor. Lets directors change the show's start and end
   * dates. When shrinking the range, warns if scheduled days would be
   * lost outside the new boundaries.
   */
  import type { ScheduleDoc, Show } from "@rehearsal-block/core";

  interface Props {
    show: ScheduleDoc;
    onupdateshow: (patch: Partial<Show>) => void;
    onclose: () => void;
  }

  const { show, onupdateshow, onclose }: Props = $props();

  // Intentional snapshots - we edit a draft and apply on confirm,
  // not live-updating the grid while the user types.
  // svelte-ignore state_referenced_locally
  let startDate = $state(show.show.startDate);
  // svelte-ignore state_referenced_locally
  let endDate = $state(show.show.endDate);

  const hasError = $derived(endDate < startDate);

  /** Count scheduled days that would fall outside the new range. */
  const daysOutsideRange = $derived.by(() => {
    let count = 0;
    for (const date of Object.keys(show.schedule)) {
      if (date < startDate || date > endDate) count++;
    }
    return count;
  });

  /** Count conflicts that would fall outside the new range. */
  const conflictsOutsideRange = $derived.by(() => {
    let count = 0;
    for (const c of show.conflicts) {
      if (c.date < startDate || c.date > endDate) count++;
    }
    return count;
  });

  function apply() {
    if (hasError) return;
    onupdateshow({ startDate, endDate });
    onclose();
  }

  function onEscape(e: KeyboardEvent) {
    if (e.key === "Escape") onclose();
  }
</script>

<svelte:window onkeydown={onEscape} />

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="backdrop" onclick={onclose}></div>

<div class="modal" role="dialog" aria-modal="true" aria-label="Edit dates">
  <header class="modal-header">
    <div>
      <div class="eyebrow">Show Dates</div>
      <h2>{show.show.name}</h2>
    </div>
    <button type="button" class="close-btn" onclick={onclose} aria-label="Close">
      ×
    </button>
  </header>

  <div class="modal-body">
    <div class="date-row">
      <div class="date-field">
        <label for="start-date">Start date</label>
        <input
          id="start-date"
          type="date"
          value={startDate}
          onchange={(e) => (startDate = e.currentTarget.value)}
        />
      </div>
      <div class="date-field">
        <label for="end-date">End date</label>
        <input
          id="end-date"
          type="date"
          value={endDate}
          onchange={(e) => (endDate = e.currentTarget.value)}
        />
      </div>
    </div>

    {#if hasError}
      <div class="warning error">
        End date must be on or after the start date.
      </div>
    {/if}

    {#if !hasError && (daysOutsideRange > 0 || conflictsOutsideRange > 0)}
      <div class="warning">
        <strong>Heads up:</strong>
        {#if daysOutsideRange > 0}
          {daysOutsideRange} scheduled day{daysOutsideRange === 1 ? "" : "s"}
        {/if}
        {#if daysOutsideRange > 0 && conflictsOutsideRange > 0}
          and
        {/if}
        {#if conflictsOutsideRange > 0}
          {conflictsOutsideRange} conflict{conflictsOutsideRange === 1 ? "" : "s"}
        {/if}
        will fall outside the new range. The data won't be deleted - it just
        won't be visible on the grid until the dates are expanded again.
      </div>
    {/if}

    {#if !hasError && startDate === show.show.startDate && endDate === show.show.endDate}
      <p class="hint">No changes made.</p>
    {/if}
  </div>

  <footer class="modal-footer">
    <button type="button" class="btn btn-secondary" onclick={onclose}>
      Cancel
    </button>
    <button
      type="button"
      class="btn btn-primary"
      disabled={hasError || (startDate === show.show.startDate && endDate === show.show.endDate)}
      onclick={apply}
    >
      Apply
    </button>
  </footer>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(45, 31, 61, 0.6);
    z-index: 100;
  }

  .modal {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 440px;
    max-width: calc(100vw - 2 * var(--space-4));
    background: var(--color-surface);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-lg);
    z-index: 110;
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
    gap: var(--space-3);
  }

  .eyebrow {
    font-size: 0.6875rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--color-text-subtle);
    font-weight: 700;
    margin-bottom: 2px;
  }

  .modal-header h2 {
    font-family: var(--font-display);
    color: var(--color-plum);
    font-size: 1.125rem;
    margin: 0;
  }

  .close-btn {
    background: transparent;
    border: none;
    font-size: 1.5rem;
    cursor: pointer;
    color: var(--color-text-muted);
    line-height: 1;
    padding: 0 var(--space-2);
    border-radius: var(--radius-sm);
  }
  .close-btn:hover {
    color: var(--color-plum);
  }

  .modal-body {
    padding: var(--space-5);
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .date-row {
    display: flex;
    gap: var(--space-4);
  }

  .date-field {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .date-field label {
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--color-text-subtle);
    font-weight: 700;
  }

  .date-field input[type="date"] {
    font: inherit;
    font-size: 0.9375rem;
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--color-border-strong);
    border-radius: var(--radius-sm);
    background: var(--color-surface);
    color: var(--color-text);
  }
  .date-field input:focus {
    outline: 2px solid var(--color-teal);
    outline-offset: 0;
    border-color: var(--color-teal);
  }

  .warning {
    padding: var(--space-3) var(--space-4);
    border-radius: var(--radius-md);
    font-size: 0.8125rem;
    background: var(--color-warning-bg);
    border: 1px solid var(--color-warning);
    color: var(--color-text);
  }

  .warning.error {
    background: var(--color-danger-bg);
    border-color: var(--color-danger);
    color: var(--color-danger);
  }

  .hint {
    font-size: 0.8125rem;
    color: var(--color-text-muted);
    font-style: italic;
    margin: 0;
  }

  .modal-footer {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2);
    padding: var(--space-3) var(--space-5);
    border-top: 1px solid var(--color-border);
    background: var(--color-bg-alt);
  }
</style>
