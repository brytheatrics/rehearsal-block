<script lang="ts">
  /**
   * "Coming Soon" modal shown when the user clicks any of the disabled
   * Sign In / Buy Now / Buy Rehearsal Block buttons before launch. It
   * explains the launch gating and offers a one-click transition to
   * `NotifyLaunchModal` so the user can drop their email.
   *
   * Usage pattern (parent page or layout):
   *   - Track two state vars: `comingSoonOpen` and `notifyOpen`
   *   - Sign In / Buy click handlers set `comingSoonOpen = true`
   *   - Pass `onnotify` that sets `comingSoonOpen = false` then
   *     `notifyOpen = true`. The notify modal handles its own close.
   *   - Pass `onclose` that sets `comingSoonOpen = false`.
   *
   * The `context` prop controls the title and intro copy so the modal
   * can feel specific to what the user just clicked.
   */
  interface Props {
    /** Which button opened the modal - affects the title and copy. */
    context: "sign-in" | "purchase";
    onclose: () => void;
    onnotify: () => void;
  }

  const { context, onclose, onnotify }: Props = $props();

  /* Derived from the prop via $derived so Svelte 5's reactivity system
     knows to recompute if the parent swaps the context between renders.
     (In practice the modal is usually mounted fresh with a fixed context,
     but $derived is the idiomatic way to silence the "captures initial
     value" warning.) */
  const title = $derived(
    context === "sign-in" ? "Sign in - Coming soon" : "Purchase - Coming soon",
  );
  const intro = $derived(
    context === "sign-in"
      ? "Rehearsal Block is still in active development and sign-in isn't live yet. It'll open as soon as the paid version launches."
      : "Rehearsal Block is still in active development and the purchase flow isn't live yet. It'll open as soon as the paid version launches.",
  );

  /* Close on Escape. Matches the overall app's modal behavior. */
  function handleKey(e: KeyboardEvent) {
    if (e.key === "Escape") onclose();
  }
</script>

<svelte:window onkeydown={handleKey} />

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="backdrop" onclick={onclose}></div>

<div class="modal" role="dialog" aria-labelledby="coming-soon-title">
  <div class="modal-header">
    <h2 id="coming-soon-title">{title}</h2>
    <button type="button" class="close-btn" aria-label="Close" onclick={onclose}>&times;</button>
  </div>

  <div class="modal-body">
    <p class="intro">{intro}</p>
    <p class="intro">
      If you'd like a heads-up the day it launches, drop your email.
    </p>

    <div class="actions">
      <button type="button" class="ghost-btn" onclick={onclose}>Close</button>
      <button type="button" class="primary-btn" onclick={onnotify}>
        Notify me when it launches
      </button>
    </div>
  </div>
</div>

<style>
  /* Styling intentionally mirrors NotifyLaunchModal.svelte so the two
     feel like one family when users transition between them. Any visual
     tweaks should be made in both files together. */
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
    overflow-y: auto;
  }

  .intro {
    font-size: 0.9375rem;
    color: var(--color-text);
    line-height: 1.6;
    margin: 0 0 var(--space-3);
  }
  .intro:last-of-type {
    color: var(--color-text-muted);
    margin-bottom: 0;
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2);
    margin-top: var(--space-5);
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

  @media (max-width: 480px) {
    .actions {
      flex-direction: column-reverse;
      align-items: stretch;
    }
    .ghost-btn,
    .primary-btn {
      text-align: center;
    }
  }
</style>
