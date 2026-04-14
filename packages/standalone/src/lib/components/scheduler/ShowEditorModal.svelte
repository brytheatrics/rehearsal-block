<script lang="ts">
  /**
   * Show name editor. Lean modal focused on the show's identity.
   * Font and appearance settings now live in the Defaults modal.
   *
   * In demo mode the show name is read-only (greyed out) to drive the
   * paywall; the real /app route passes nameReadOnly={false}.
   */
  import type { ScheduleDoc, Show } from "@rehearsal-block/core";

  interface Props {
    show: ScheduleDoc;
    nameReadOnly?: boolean;
    onupdateshow: (patch: Partial<Show>) => void;
    onclose: () => void;
  }

  const { show, nameReadOnly = false, onupdateshow, onclose }: Props = $props();

  function onEscape(e: KeyboardEvent) {
    if (e.key === "Escape") onclose();
  }
</script>

<svelte:window onkeydown={onEscape} />

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="backdrop" onclick={onclose}></div>

<div class="modal" role="dialog" aria-modal="true" aria-label="Show settings">
  <header class="modal-header">
    <div>
      <div class="eyebrow">Show</div>
      <h2>{show.show.name || "Untitled Show"}</h2>
    </div>
    <button type="button" class="close-btn" onclick={onclose} aria-label="Close">
      ×
    </button>
  </header>

  <div class="modal-body">
    <section class="section">
      <h3>Show Name</h3>
      {#if nameReadOnly}
        <p class="hint">Purchase Rehearsal Block to change the show name.</p>
      {/if}
      <input
        type="text"
        class="name-input"
        value={show.show.name}
        placeholder="Show name"
        disabled={nameReadOnly}
        oninput={(e) => onupdateshow({ name: e.currentTarget.value })}
      />
    </section>
  </div>

  <footer class="modal-footer">
    <button type="button" class="btn btn-primary" onclick={onclose}>Done</button>
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
    width: 420px;
    max-width: calc(100vw - 2 * var(--space-4));
    max-height: calc(100vh - 2 * var(--space-4));
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
  }

  .section h3 {
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--color-text-subtle);
    margin: 0 0 var(--space-2) 0;
    font-weight: 700;
  }

  .hint {
    font-size: 0.6875rem;
    color: var(--color-text-muted);
    margin: 0 0 var(--space-2) 0;
    font-style: italic;
  }

  .name-input {
    font: inherit;
    font-size: 1.125rem;
    font-weight: 600;
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--color-border-strong);
    border-radius: var(--radius-sm);
    background: var(--color-surface);
    color: var(--color-text);
    width: 100%;
  }
  .name-input:focus {
    outline: 2px solid var(--color-teal);
    outline-offset: 0;
    border-color: var(--color-teal);
  }
  .name-input:disabled {
    opacity: 0.5;

    background: var(--color-bg-alt);
  }

  .modal-footer {
    display: flex;
    justify-content: flex-end;
    padding: var(--space-3) var(--space-5);
    border-top: 1px solid var(--color-border);
    background: var(--color-bg-alt);
  }
</style>
