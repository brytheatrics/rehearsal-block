<script lang="ts">
  import { page } from "$app/state";
  import { enhance } from "$app/forms";

  let { data, form } = $props();
  let submitting = $state(false);

  const canceled = page.url.searchParams.has("canceled");
</script>

<svelte:head>
  <title>Buy Rehearsal Block — $50</title>
</svelte:head>

<div class="buy-page container-sm">
  <div class="buy-card">
    <h1>Buy Rehearsal Block</h1>
    <div class="price">
      <span class="price-amount">$50</span>
      <span class="price-details">USD · one-time · lifetime access</span>
    </div>

    {#if canceled}
      <div class="notice notice-warning">
        Checkout canceled. No charge was made. You can try again whenever you're ready.
      </div>
    {/if}

    <ul class="features">
      <li>Unlimited shows, forever</li>
      <li>Cloud sync across all your devices</li>
      <li>Works offline — edit anywhere, sync when you're back online</li>
      <li>Calendar + list view, PDF export, CSV export for Google Calendar</li>
      <li>Drag-and-drop cast management with groups and conflict tracking</li>
      <li>Dress and performance modes with multi-call-time blocks</li>
      <li>No subscription, no recurring fees, no ads</li>
    </ul>

    <form method="POST" action="?/checkout" use:enhance={() => {
      submitting = true;
      return async ({ update }) => {
        await update();
        submitting = false;
      };
    }}>
      <button type="submit" class="btn btn-primary btn-lg btn-full" disabled={submitting}>
        {submitting ? "Starting checkout…" : "Continue to Checkout"}
      </button>
    </form>

    {#if form?.error}
      <div class="notice notice-error">{form.error}</div>
    {/if}

    {#if !data.alreadySignedIn}
      <p class="signin-hint">
        You don't need an account to purchase. After payment, you'll receive a link
        to sign in with the email you used at checkout.
      </p>
    {:else if data.email}
      <p class="signin-hint">
        Signed in as <strong>{data.email}</strong>. Your account will be unlocked immediately after payment.
      </p>
    {/if}

    <div class="secure-note">
      <span>Secure checkout powered by Stripe.</span>
      <span>You'll enter card details on Stripe's hosted page — we never see or store them.</span>
    </div>
  </div>
</div>

<style>
  .buy-page {
    padding: var(--space-7) 0;
  }

  .buy-card {
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    padding: var(--space-7);
    box-shadow: var(--shadow-md);
  }

  .price {
    display: flex;
    align-items: baseline;
    gap: var(--space-3);
    margin: var(--space-4) 0 var(--space-5);
  }

  .price-amount {
    font-family: var(--font-display);
    font-size: 4rem;
    font-weight: 700;
    color: var(--color-teal);
    line-height: 1;
  }

  .price-details {
    color: var(--color-text-muted);
    font-size: 0.9375rem;
  }

  .features {
    list-style: none;
    padding: 0;
    margin: 0 0 var(--space-6) 0;
  }

  .features li {
    padding: var(--space-2) 0 var(--space-2) var(--space-5);
    position: relative;
    color: var(--color-text);
  }

  .features li::before {
    content: "✓";
    position: absolute;
    left: 0;
    color: var(--color-teal);
    font-weight: 700;
  }

  .btn-full {
    width: 100%;
  }

  .notice {
    padding: var(--space-3) var(--space-4);
    border-radius: var(--radius-md);
    margin-bottom: var(--space-4);
    font-size: 0.9375rem;
  }

  .notice-warning {
    background: var(--color-warning-bg);
    color: #92400e;
    border: 1px solid var(--color-warning);
  }

  .notice-error {
    background: var(--color-danger-bg);
    color: var(--color-danger);
    border: 1px solid var(--color-danger);
    margin-top: var(--space-3);
  }

  .signin-hint {
    font-size: 0.875rem;
    color: var(--color-text-muted);
    text-align: center;
    margin: var(--space-4) 0 0 0;
  }

  .secure-note {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    margin-top: var(--space-5);
    padding-top: var(--space-4);
    border-top: 1px solid var(--color-border);
    font-size: 0.75rem;
    color: var(--color-text-subtle);
    text-align: center;
  }
</style>
