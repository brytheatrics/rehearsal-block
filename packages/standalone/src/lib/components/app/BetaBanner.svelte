<script lang="ts">
  /**
   * Teal info bar rendered at the top of /app for users whose access is
   * via beta (has_beta_access && !has_paid). Shows the display expiration
   * date and opens a feedback modal when the user clicks "Send Feedback".
   *
   * Display date comes from beta_config.display_expiration_date, exposed
   * via the beta_status view.
   */
  import FeedbackModal from "./FeedbackModal.svelte";

  let { displayExpiration }: { displayExpiration: string | null } = $props();

  let feedbackOpen = $state(false);

  /* Format YYYY-MM-DD as a friendly "April 15, 2026". Keep local-safe
     by parsing manually (new Date("2026-04-15") is UTC midnight and
     can show as the prior day in negative-offset timezones). */
  function formatDate(iso: string): string {
    const [y, m, d] = iso.split("-").map((n) => Number(n));
    if (!y || !m || !d) return iso;
    const months = ["January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December"];
    return `${months[m - 1]} ${d}, ${y}`;
  }
</script>

<div class="beta-banner" role="status">
  <span class="beta-banner-icon" aria-hidden="true">BETA</span>
  <span class="beta-banner-text">
    You're using the Rehearsal Block beta.{#if displayExpiration}
      Beta ends {formatDate(displayExpiration)}.
    {/if}
  </span>
  <button type="button" class="beta-banner-btn" onclick={() => (feedbackOpen = true)}>
    Send Feedback
  </button>
</div>

{#if feedbackOpen}
  <FeedbackModal onclose={() => (feedbackOpen = false)} />
{/if}

<style>
  .beta-banner {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-2) var(--space-4);
    background: var(--color-teal);
    color: #fff;
    font-size: 0.875rem;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
  }
  .beta-banner-icon {
    display: inline-flex;
    align-items: center;
    padding: 2px 8px;
    border-radius: var(--radius-sm);
    background: rgba(255, 255, 255, 0.22);
    font-size: 0.6875rem;
    font-weight: 700;
    letter-spacing: 0.08em;
  }
  .beta-banner-text {
    flex: 1;
    min-width: 0;
  }
  .beta-banner-btn {
    background: #fff;
    color: var(--color-teal);
    border: none;
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-md);
    font-weight: 600;
    font-size: 0.8125rem;
    cursor: pointer;
    white-space: nowrap;
  }
  .beta-banner-btn:hover {
    background: var(--color-surface-alt, #f5f5f5);
  }

  @media (max-width: 640px) {
    .beta-banner {
      font-size: 0.8125rem;
      gap: var(--space-2);
      padding: var(--space-2) var(--space-3);
    }
    .beta-banner-icon {
      padding: 2px 6px;
      font-size: 0.625rem;
    }
  }
</style>
