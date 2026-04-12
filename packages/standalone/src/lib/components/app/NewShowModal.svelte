<script lang="ts">
  /**
   * New show creation modal. Collects the minimum info needed to create
   * a blank ScheduleDoc: name, start date, end date. Time format is
   * inherited from the user's browser locale by default.
   *
   * When Phase 1 storage lands, the `oncreate` callback will write the
   * new show to IndexedDB + R2. For now it just returns the form data.
   */
  interface Props {
    onclose: () => void;
    oncreate: (data: { name: string; startDate: string; endDate: string }) => void;
  }

  const { onclose, oncreate }: Props = $props();

  let name = $state("");
  let startDate = $state("");
  let endDate = $state("");
  let error = $state("");

  function handleSubmit(e: Event) {
    e.preventDefault();
    error = "";

    const trimmedName = name.trim();
    if (!trimmedName) {
      error = "Give your show a name.";
      return;
    }
    if (!startDate) {
      error = "Pick a start date.";
      return;
    }
    if (!endDate) {
      error = "Pick an end date.";
      return;
    }
    if (endDate < startDate) {
      error = "End date can't be before the start date.";
      return;
    }

    oncreate({ name: trimmedName, startDate, endDate });
  }

  function handleKey(e: KeyboardEvent) {
    if (e.key === "Escape") onclose();
  }
</script>

<svelte:window onkeydown={handleKey} />

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="backdrop" onclick={onclose}></div>

<div class="modal" role="dialog" aria-labelledby="new-show-title">
  <div class="modal-header">
    <h2 id="new-show-title">New show</h2>
    <button type="button" class="close-btn" aria-label="Close" onclick={onclose}>&times;</button>
  </div>

  <form class="modal-body" onsubmit={handleSubmit} novalidate>
    <div class="field">
      <label for="show-name">Show name</label>
      <input
        id="show-name"
        type="text"
        bind:value={name}
        placeholder="Romeo & Juliet"
        autocomplete="off"
      />
    </div>

    <div class="field-row">
      <div class="field">
        <label for="show-start">Start date</label>
        <input
          id="show-start"
          type="date"
          bind:value={startDate}
        />
      </div>
      <div class="field">
        <label for="show-end">End date</label>
        <input
          id="show-end"
          type="date"
          bind:value={endDate}
        />
      </div>
    </div>

    {#if error}
      <p class="error-msg">{error}</p>
    {/if}

    <div class="actions">
      <button type="button" class="ghost-btn" onclick={onclose}>Cancel</button>
      <button type="submit" class="primary-btn">Create show</button>
    </div>
  </form>
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
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 440px;
    max-width: calc(100vw - 2 * var(--space-4));
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
    align-items: center;
    justify-content: space-between;
    padding: var(--space-4) var(--space-5);
    border-bottom: 1px solid var(--color-border);
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

  .modal-body {
    padding: var(--space-4) var(--space-5) var(--space-5);
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    margin-bottom: var(--space-3);
    flex: 1;
  }
  .field label {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--color-text);
  }
  .field input {
    font: inherit;
    font-size: 0.875rem;
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: var(--color-surface);
    color: var(--color-text);
  }
  .field input:focus {
    outline: 2px solid var(--color-plum);
    outline-offset: 1px;
    border-color: var(--color-plum);
  }

  .field-row {
    display: flex;
    gap: var(--space-3);
  }

  .error-msg {
    font-size: 0.8125rem;
    color: var(--color-danger);
    margin: 0 0 var(--space-3);
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2);
    margin-top: var(--space-4);
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
    transition: background var(--transition-fast);
  }
  .primary-btn:hover {
    background: var(--color-plum-dark);
  }
</style>
