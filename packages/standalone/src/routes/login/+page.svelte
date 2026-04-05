<script lang="ts">
  import { enhance } from "$app/forms";

  let { form, data } = $props();

  let submitting = $state(false);
</script>

<svelte:head>
  <title>Sign In — Rehearsal Block</title>
</svelte:head>

<div class="login-page container-sm">
  <div class="login-card">
    <h1>Sign in to Rehearsal Block</h1>
    <p class="login-lede">
      {#if data.user}
        You're already signed in as <strong>{data.user.email}</strong>.
        {#if data.profile?.has_paid}
          <a href="/app">Go to your shows →</a>
        {:else}
          <a href="/buy">Complete your purchase →</a>
        {/if}
      {:else}
        Use Google or an email magic link — no password required.
      {/if}
    </p>

    {#if !data.user}
      <form method="POST" action="?/google" use:enhance={() => {
        submitting = true;
        return async ({ update }) => {
          await update();
          submitting = false;
        };
      }}>
        <button type="submit" class="btn btn-primary btn-lg btn-full" disabled={submitting}>
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
            <path fill="#FFFFFF" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"/>
            <path fill="#FFFFFF" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" opacity=".9"/>
            <path fill="#FFFFFF" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" opacity=".7"/>
            <path fill="#FFFFFF" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" opacity=".5"/>
          </svg>
          Sign in with Google
        </button>
      </form>

      <div class="divider"><span>or</span></div>

      <form method="POST" action="?/magiclink" use:enhance={() => {
        submitting = true;
        return async ({ update }) => {
          await update();
          submitting = false;
        };
      }}>
        {#if form?.success}
          <div class="success-message">
            We sent a magic link to <strong>{form.email}</strong>. Click the link in the email to finish signing in.
          </div>
        {:else}
          <label for="email">Email address</label>
          <input
            type="email"
            id="email"
            name="email"
            required
            placeholder="you@theatre.com"
            value={form?.email ?? ""}
            disabled={submitting}
          />
          {#if form?.error}
            <div class="error-message">{form.error}</div>
          {/if}
          <button type="submit" class="btn btn-plum btn-lg btn-full" disabled={submitting}>
            Send me a magic link
          </button>
        {/if}
      </form>
    {/if}
  </div>
</div>

<style>
  .login-page {
    padding: var(--space-7) 0;
  }

  .login-card {
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    padding: var(--space-7);
    box-shadow: var(--shadow-md);
  }

  .login-card h1 {
    font-size: 1.75rem;
    margin-bottom: var(--space-3);
  }

  .login-lede {
    color: var(--color-text-muted);
    margin-bottom: var(--space-5);
  }

  .btn-full {
    width: 100%;
  }

  .divider {
    display: flex;
    align-items: center;
    margin: var(--space-5) 0;
    color: var(--color-text-subtle);
    font-size: 0.875rem;
  }

  .divider::before,
  .divider::after {
    content: "";
    flex: 1;
    height: 1px;
    background: var(--color-border);
  }

  .divider span {
    padding: 0 var(--space-3);
  }

  label {
    display: block;
    font-weight: 600;
    margin-bottom: var(--space-2);
    color: var(--color-text);
  }

  input[type="email"] {
    width: 100%;
    padding: var(--space-3) var(--space-4);
    border: 1px solid var(--color-border-strong);
    border-radius: var(--radius-md);
    font-size: 1rem;
    margin-bottom: var(--space-4);
  }

  input[type="email"]:focus {
    outline: none;
    border-color: var(--color-teal);
    box-shadow: 0 0 0 3px rgba(46, 154, 143, 0.15);
  }

  .error-message {
    color: var(--color-danger);
    background: var(--color-danger-bg);
    padding: var(--space-3);
    border-radius: var(--radius-md);
    margin-bottom: var(--space-3);
    font-size: 0.875rem;
  }

  .success-message {
    color: var(--color-success);
    background: var(--color-success-bg);
    padding: var(--space-4);
    border-radius: var(--radius-md);
    font-size: 0.9375rem;
  }
</style>
