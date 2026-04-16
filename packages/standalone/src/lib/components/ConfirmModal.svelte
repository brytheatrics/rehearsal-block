<script lang="ts">
  /**
   * Themed replacement for window.confirm() - matches the in-app delete
   * modal's styling instead of the browser-native dialog that looks
   * generic and breaks the visual continuity.
   *
   * Stacks above other modals via a very high z-index so it remains
   * interactive when triggered from inside NewShowModal, MyDefaultsModal,
   * EditShowModal, etc. Escape cancels, Enter confirms.
   */
  interface Props {
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    variant?: "danger" | "primary";
    onconfirm: () => void;
    oncancel: () => void;
  }

  const {
    title,
    message,
    confirmLabel = "Confirm",
    cancelLabel = "Cancel",
    variant = "primary",
    onconfirm,
    oncancel,
  }: Props = $props();

  function onKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      oncancel();
    } else if (e.key === "Enter") {
      e.preventDefault();
      onconfirm();
    }
  }
</script>

<svelte:window onkeydown={onKeydown} />

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="confirm-backdrop" onclick={oncancel}></div>
<div class="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="confirm-modal-title">
  <h3 id="confirm-modal-title">{title}</h3>
  <p>{message}</p>
  <div class="confirm-actions">
    <button type="button" class="confirm-cancel" onclick={oncancel}>{cancelLabel}</button>
    <button
      type="button"
      class={variant === "danger" ? "confirm-primary confirm-danger" : "confirm-primary"}
      onclick={onconfirm}
      autofocus
    >
      {confirmLabel}
    </button>
  </div>
</div>

<style>
  .confirm-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(45, 31, 61, 0.6);
    /* High z-index so this stacks above any parent modal (DefaultsModal
       uses 110, NewShowModal / MyDefaultsModal use 1010). */
    z-index: 2000;
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
    z-index: 2010;
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
    transition: color var(--transition-fast), border-color var(--transition-fast);
  }
  .confirm-cancel:hover {
    color: var(--color-text);
    border-color: var(--color-text-muted);
  }

  .confirm-primary {
    font: inherit;
    font-size: 0.8125rem;
    font-weight: 600;
    padding: var(--space-2) var(--space-4);
    border: none;
    border-radius: var(--radius-sm);
    background: var(--color-teal);
    color: #fff;
    cursor: pointer;
    transition: background var(--transition-fast);
  }
  .confirm-primary:hover {
    background: var(--color-teal-dark, #2e6b68);
  }

  .confirm-danger {
    background: var(--color-danger);
  }
  .confirm-danger:hover {
    background: var(--color-danger-dark, #a32424);
  }
</style>
