<script lang="ts">
  /**
   * Account settings page. Shows user info, sign-out, Stripe receipt
   * link, and delete account button.
   */
  let { data } = $props();

  let deleteConfirmStep = $state(0); // 0=idle, 1=first confirm, 2=confirmed
  let deleting = $state(false);
  let deleteError = $state("");

  async function handleDeleteAccount() {
    if (deleteConfirmStep < 2) {
      deleteConfirmStep++;
      return;
    }
    deleting = true;
    deleteError = "";
    try {
      const res = await fetch("/api/account", { method: "DELETE" });
      if (!res.ok) {
        const msg = await res.text().catch(() => "Unknown error");
        throw new Error(msg);
      }
      // Redirect to landing page after deletion
      window.location.href = "/";
    } catch (err: any) {
      deleteError = err.message || "Failed to delete account.";
      deleting = false;
    }
  }

  function cancelDelete() {
    deleteConfirmStep = 0;
  }

  function formatDate(iso: string | null | undefined): string {
    if (!iso) return "Unknown";
    try {
      return new Date(iso).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    } catch {
      return iso;
    }
  }
</script>

<svelte:head>
  <title>Account - Rehearsal Block</title>
</svelte:head>

<div class="account-page container">
  <h1>Account</h1>

  <section class="card">
    <h2>Profile</h2>
    <div class="info-grid">
      <div class="info-row">
        <span class="info-label">Email</span>
        <span class="info-value">{data.user?.email ?? "Unknown"}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Status</span>
        <span class="info-value">
          {#if data.profile?.has_paid}
            <span class="badge badge-paid">Paid</span>
          {:else}
            <span class="badge badge-free">Free</span>
          {/if}
        </span>
      </div>
      <div class="info-row">
        <span class="info-label">Member since</span>
        <span class="info-value">{formatDate(data.profile?.created_at)}</span>
      </div>
    </div>
  </section>

  <section class="card">
    <h2>Actions</h2>
    <div class="actions">
      <form method="POST" action="/login?/signout">
        <button type="submit" class="btn btn-secondary">Sign out</button>
      </form>
      <a href="/help" class="btn btn-secondary">Help</a>
      <a href="/contact" class="btn btn-secondary">Contact</a>
    </div>
  </section>

  <section class="card card-danger">
    <h2>Delete account</h2>
    <p>
      Permanently delete your account and all your data. This removes all your
      shows, settings, and personal information. This action cannot be undone.
    </p>
    {#if deleteError}
      <p class="error">{deleteError}</p>
    {/if}
    {#if deleteConfirmStep === 0}
      <button type="button" class="btn btn-danger" onclick={handleDeleteAccount}>
        Delete my account
      </button>
    {:else if deleteConfirmStep === 1}
      <p class="confirm-text">Are you sure? All your shows will be permanently deleted.</p>
      <div class="confirm-actions">
        <button type="button" class="btn btn-secondary" onclick={cancelDelete}>Cancel</button>
        <button type="button" class="btn btn-danger" onclick={handleDeleteAccount}>
          Yes, delete everything
        </button>
      </div>
    {:else}
      <p class="confirm-text">This is your last chance. Click below to permanently delete your account.</p>
      <div class="confirm-actions">
        <button type="button" class="btn btn-secondary" onclick={cancelDelete}>Cancel</button>
        <button type="button" class="btn btn-danger" disabled={deleting} onclick={handleDeleteAccount}>
          {deleting ? "Deleting..." : "Permanently delete my account"}
        </button>
      </div>
    {/if}
  </section>
</div>

<style>
  .account-page {
    max-width: 640px;
    padding: var(--space-5) var(--space-4);
  }

  h1 {
    font-family: var(--font-display);
    color: var(--color-plum);
    margin: 0 0 var(--space-5);
  }

  .card {
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    padding: var(--space-4) var(--space-5);
    margin-bottom: var(--space-4);
  }

  .card h2 {
    font-size: 0.875rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--color-text-muted);
    margin: 0 0 var(--space-3);
  }

  .info-grid {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .info-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--space-2) 0;
    border-bottom: 1px solid var(--color-border);
  }
  .info-row:last-child {
    border-bottom: none;
  }

  .info-label {
    font-size: 0.8125rem;
    color: var(--color-text-muted);
  }

  .info-value {
    font-size: 0.875rem;
    font-weight: 500;
  }

  .badge {
    font-size: 0.6875rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    padding: 2px 10px;
    border-radius: var(--radius-full);
  }

  .badge-paid {
    background: var(--color-teal);
    color: #fff;
  }

  .badge-free {
    background: var(--color-bg-alt);
    color: var(--color-text-muted);
    border: 1px solid var(--color-border);
  }

  .actions {
    display: flex;
    gap: var(--space-2);
    flex-wrap: wrap;
  }

  .card-danger {
    border-color: var(--color-danger);
    border-style: dashed;
  }

  .card-danger h2 {
    color: var(--color-danger);
  }

  .card-danger p {
    font-size: 0.8125rem;
    color: var(--color-text-muted);
    line-height: 1.5;
    margin: 0 0 var(--space-3);
  }

  .btn-danger {
    background: var(--color-danger);
    color: #fff;
    border: none;
    font: inherit;
    font-size: 0.8125rem;
    font-weight: 600;
    padding: var(--space-2) var(--space-4);
    border-radius: var(--radius-sm);
    cursor: pointer;
  }
  .btn-danger:hover {
    background: #b71c1c;
  }
  .btn-danger:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .error {
    color: var(--color-danger);
    font-size: 0.8125rem;
    margin: 0 0 var(--space-2);
  }

  .confirm-text {
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--color-danger);
  }

  .confirm-actions {
    display: flex;
    gap: var(--space-2);
  }
</style>
