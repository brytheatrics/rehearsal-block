<script lang="ts">
  import { enhance } from "$app/forms";
  import { invalidateAll } from "$app/navigation";

  let { data, form } = $props();

  let submitting = $state(false);
  let codeInput = $state("");
  let activating = $state(false);
  let activateError = $state("");

  async function handleActivate(e: SubmitEvent) {
    e.preventDefault();
    if (activating) return;
    activateError = "";
    const trimmed = codeInput.trim();
    if (!trimmed) {
      activateError = "Enter the beta code you were sent.";
      return;
    }
    activating = true;
    try {
      const res = await fetch("/api/beta/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: trimmed }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        activateError = typeof payload?.error === "string"
          ? payload.error
          : "Couldn't activate. Check the code and try again.";
        return;
      }
      // Force the server load to re-run so the route guard sees has_beta_access
      // and the navigate to /app succeeds.
      await invalidateAll();
      window.location.assign("/app");
    } catch {
      activateError = "Network error. Try again.";
    } finally {
      activating = false;
    }
  }
</script>

<svelte:head>
  <title>Rehearsal Block - Beta</title>
</svelte:head>

<div class="beta-page container-sm">
  <div class="beta-card">
    <img src="/rehearsal-block-logo.svg" alt="Rehearsal Block" class="beta-logo" />
    <h1>Welcome to the Rehearsal Block beta</h1>

    {#if !data.betaActive}
      <p class="beta-lede">
        The beta period has ended. Thank you to everyone who tested!
      </p>
      <a href="/buy" class="btn btn-primary btn-lg btn-full">Buy Rehearsal Block</a>
      <p class="beta-hint">
        If you were in the beta, your shows are still saved under your account.
        Sign in after purchasing and they'll be right where you left them.
      </p>
    {:else if !data.user}
      <p class="beta-lede">
        You've been invited to help test Rehearsal Block before launch.
        Sign in below, then enter the beta code you were sent.
      </p>

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
            We sent a magic link to <strong>{form.email}</strong>. Click the link in the email, then return here to enter your beta code.
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
    {:else}
      <!-- Signed in, beta active, not yet activated. -->
      <p class="beta-lede">
        Signed in as <strong>{data.user.email}</strong>.
        Enter the beta code you were sent to unlock full access.
      </p>

      <form onsubmit={handleActivate}>
        <label for="beta-code">Beta code</label>
        <input
          type="text"
          id="beta-code"
          bind:value={codeInput}
          placeholder="Enter code"
          autocapitalize="characters"
          autocomplete="off"
          spellcheck="false"
          disabled={activating}
        />
        {#if activateError}
          <div class="error-message">{activateError}</div>
        {/if}
        <button type="submit" class="btn btn-primary btn-lg btn-full" disabled={activating}>
          {activating ? "Activating..." : "Activate beta access"}
        </button>
      </form>

      {#if data.displayExpiration}
        <p class="beta-hint">
          Beta access runs through {data.displayExpiration}.
        </p>
      {/if}
    {/if}
  </div>
</div>

<style>
  .beta-page {
    padding: var(--space-7) 0;
  }
  .beta-card {
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    padding: var(--space-7);
    box-shadow: var(--shadow-md);
    text-align: left;
  }
  .beta-logo {
    height: 56px;
    width: auto;
    margin-bottom: var(--space-4);
  }
  .beta-card h1 {
    font-size: 1.75rem;
    margin-bottom: var(--space-3);
  }
  .beta-lede {
    color: var(--color-text-muted);
    margin-bottom: var(--space-5);
    line-height: 1.5;
  }
  .beta-hint {
    color: var(--color-text-subtle);
    font-size: 0.875rem;
    text-align: center;
    margin-top: var(--space-4);
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
  input[type="email"],
  input[type="text"] {
    width: 100%;
    padding: var(--space-3) var(--space-4);
    border: 1px solid var(--color-border-strong);
    border-radius: var(--radius-md);
    font-size: 1rem;
    margin-bottom: var(--space-4);
    font-family: inherit;
  }
  input[type="text"] {
    letter-spacing: 0.05em;
    text-transform: uppercase;
    font-weight: 600;
  }
  input:focus {
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
