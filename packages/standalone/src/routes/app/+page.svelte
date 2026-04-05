<script lang="ts">
  import { enhance } from "$app/forms";

  let { data } = $props();
</script>

<svelte:head>
  <title>My Shows — Rehearsal Block</title>
</svelte:head>

<div class="app-page container">
  <header class="app-header">
    <div>
      <h1>My Shows</h1>
      <p class="welcome">Welcome, <strong>{data.user.email}</strong>.</p>
    </div>
    <div class="header-actions">
      <button type="button" class="btn btn-primary" disabled title="Coming in the next build session">
        + New Show
      </button>
      <form method="POST" action="/login?/signout" use:enhance>
        <button type="submit" class="btn btn-secondary">Sign out</button>
      </form>
    </div>
  </header>

  <div class="placeholder-panel">
    <h2>Your shows list will live here.</h2>
    <p>
      The authenticated app shell is wired up: you're signed in, your account is marked paid,
      and the route guard is letting you through. The actual shows list, calendar grid,
      cast management, day editor, and export tools are built in follow-up sessions.
    </p>
    <p>
      Everything in this page is saved to Supabase under your user ID (<code>{data.user.id}</code>),
      protected by row-level security policies. No other user — signed in or otherwise —
      can read or write your data.
    </p>
    <div class="debug">
      <h3>Account info</h3>
      <dl>
        <dt>Email</dt>
        <dd>{data.user.email}</dd>
        <dt>User ID</dt>
        <dd><code>{data.user.id}</code></dd>
        <dt>Paid</dt>
        <dd>{data.profile?.has_paid ? "Yes ✓" : "No"}</dd>
        {#if data.profile?.stripe_customer_id}
          <dt>Stripe Customer</dt>
          <dd><code>{data.profile.stripe_customer_id}</code></dd>
        {/if}
        <dt>Signed up</dt>
        <dd>{data.profile?.created_at ? new Date(data.profile.created_at).toLocaleString() : "—"}</dd>
      </dl>
    </div>
  </div>
</div>

<style>
  .app-page {
    max-width: 1200px;
  }

  .app-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    margin-bottom: var(--space-6);
    gap: var(--space-4);
  }

  .app-header h1 {
    margin-bottom: var(--space-2);
  }

  .welcome {
    color: var(--color-text-muted);
    margin: 0;
  }

  .header-actions {
    display: flex;
    gap: var(--space-2);
  }

  .header-actions button[disabled] {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .placeholder-panel {
    background: var(--color-bg-alt);
    border: 1px dashed var(--color-border-strong);
    border-radius: var(--radius-lg);
    padding: var(--space-6);
  }

  .placeholder-panel h2 {
    font-size: 1.5rem;
    color: var(--color-text);
    margin-bottom: var(--space-3);
  }

  .placeholder-panel p {
    color: var(--color-text-muted);
  }

  .placeholder-panel code {
    font-family: var(--font-mono);
    font-size: 0.8125rem;
    background: var(--color-surface);
    padding: 1px var(--space-1);
    border-radius: var(--radius-sm);
  }

  .debug {
    margin-top: var(--space-5);
    padding: var(--space-4);
    background: var(--color-surface);
    border-radius: var(--radius-md);
    border: 1px solid var(--color-border);
  }

  .debug h3 {
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--color-text-subtle);
    margin: 0 0 var(--space-3) 0;
  }

  .debug dl {
    margin: 0;
    display: grid;
    grid-template-columns: 120px 1fr;
    gap: var(--space-2) var(--space-4);
    font-size: 0.875rem;
  }

  .debug dt {
    font-weight: 600;
    color: var(--color-text-muted);
  }

  .debug dd {
    margin: 0;
    color: var(--color-text);
  }
</style>
