<script lang="ts">
  let { data } = $props();
</script>

<svelte:head>
  <title>Payment received — Rehearsal Block</title>
</svelte:head>

<div class="success-page container-sm">
  <div class="success-card">
    {#if data.paid}
      <div class="success-icon">✓</div>
      <h1>Thank you!</h1>
      <p class="lede">
        Your purchase is complete. Rehearsal Block is now unlocked for your account.
      </p>

      {#if data.alreadySignedIn}
        <a href="/app" class="btn btn-primary btn-lg">Go to My Shows</a>
      {:else}
        <p>
          We sent a sign-in link to <strong>{data.email ?? "the email you used"}</strong>.
          Click that link to get into your account.
        </p>
        <a href="/login" class="btn btn-primary btn-lg">Go to Sign In</a>
      {/if}
    {:else}
      <h1>Payment pending</h1>
      <p class="lede">
        We haven't received confirmation from Stripe yet. This usually only takes a few seconds.
      </p>
      <p>
        If you were charged, refresh this page. If you keep seeing this message,
        <a href="/buy">try again</a> or contact support.
      </p>
    {/if}
  </div>
</div>

<style>
  .success-page {
    padding: var(--space-8) 0;
    text-align: center;
  }

  .success-card {
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    padding: var(--space-7);
    box-shadow: var(--shadow-md);
  }

  .success-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 80px;
    height: 80px;
    border-radius: 50%;
    background: var(--color-teal);
    color: white;
    font-size: 3rem;
    font-weight: 700;
    margin: 0 auto var(--space-5);
  }

  .lede {
    font-size: 1.125rem;
    color: var(--color-text-muted);
    margin-bottom: var(--space-5);
  }
</style>
