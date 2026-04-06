<script lang="ts">
  /**
   * Minimal toast notification. Renders a brief message that auto-
   * dismisses after a timeout. The parent controls visibility via the
   * `message` prop: set it to a non-empty string to show, empty to hide.
   */

  interface Props {
    message: string;
    duration?: number;
    ondismiss: () => void;
  }

  const { message, duration = 2000, ondismiss }: Props = $props();

  $effect(() => {
    if (!message) return;
    const t = setTimeout(ondismiss, duration);
    return () => clearTimeout(t);
  });
</script>

{#if message}
  <div class="toast" role="status" aria-live="polite">
    {message}
  </div>
{/if}

<style>
  .toast {
    position: fixed;
    bottom: var(--space-5);
    left: 50%;
    transform: translateX(-50%);
    background: var(--color-plum);
    color: var(--color-text-inverse);
    padding: var(--space-2) var(--space-5);
    border-radius: var(--radius-full);
    font-size: 0.8125rem;
    font-weight: 600;
    box-shadow: var(--shadow-lg);
    z-index: 200;
    pointer-events: none;
    animation: toast-in 150ms ease;
  }

  @keyframes toast-in {
    from {
      opacity: 0;
      transform: translateX(-50%) translateY(8px);
    }
    to {
      opacity: 1;
      transform: translateX(-50%) translateY(0);
    }
  }
</style>
