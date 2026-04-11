<script lang="ts">
  /**
   * "Notify me when Rehearsal Block launches" email capture modal.
   *
   * Storage: Netlify Forms. The form name "launch-signup" is declared
   * in static/__forms.html (Netlify's build-time detector stub). On
   * submit we POST a URL-encoded body to "/" with form-name=launch-signup;
   * Netlify intercepts the request and files it under Forms in the
   * dashboard. Submissions can be emailed to Blake via Netlify's
   * notification settings.
   *
   * On localhost there's no Netlify proxy, so the POST 404s. We detect
   * that and show a "saved (local dev stub)" success state so testing
   * the UI doesn't look broken.
   */
  interface Props {
    /** Tag written into the Netlify submission so Blake can tell which
     *  page the signup came from ("landing" vs "demo"). */
    source: "landing" | "demo";
    onclose: () => void;
  }

  const { source, onclose }: Props = $props();

  let name = $state("");
  let email = $state("");
  /** Netlify honeypot field - if a bot fills this, the submission is
   *  silently discarded. Real users never see it. */
  let botField = $state("");
  let status = $state<"idle" | "submitting" | "success" | "error">("idle");
  let errorMsg = $state("");

  /** Encode form data the way Netlify Forms expects. */
  function encodeFormBody(data: Record<string, string>): string {
    return Object.keys(data)
      .map((k) => encodeURIComponent(k) + "=" + encodeURIComponent(data[k] ?? ""))
      .join("&");
  }

  async function submit(e: Event) {
    e.preventDefault();
    if (status === "submitting") return;

    const trimmedName = name.trim();
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !/.+@.+\..+/.test(trimmedEmail)) {
      status = "error";
      errorMsg = "Please enter a valid email.";
      return;
    }

    status = "submitting";
    errorMsg = "";

    const body = encodeFormBody({
      "form-name": "launch-signup",
      "bot-field": botField,
      name: trimmedName,
      email: trimmedEmail,
      source,
    });

    try {
      const res = await fetch("/", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });
      // On Netlify, a 200 or 303 means the submission was captured.
      // On localhost dev, "/" returns the home page (200) which is
      // indistinguishable from success - we treat the whole path as a
      // success since the UI flow is the same. Real failures come back
      // as network errors and fall into the catch block.
      if (res.ok || res.status === 303) {
        status = "success";
      } else {
        status = "error";
        errorMsg = "Something went wrong. Please try again.";
      }
    } catch {
      status = "error";
      errorMsg = "Could not reach the server. Please try again.";
    }
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="backdrop" onclick={onclose}></div>

<div class="modal" role="dialog" aria-labelledby="notify-title">
  <div class="modal-header">
    <h2 id="notify-title">Get notified at launch</h2>
    <button type="button" class="close-btn" aria-label="Close" onclick={onclose}>&times;</button>
  </div>

  <div class="modal-body">
    {#if status === "success"}
      <div class="success">
        <svg width="44" height="44" viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true">
          <path d="m424-296 282-282-56-56-226 226-114-114-56 56 170 170Zm56 216q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Z"/>
        </svg>
        <p class="success-title">You're on the list</p>
        <p class="success-hint">I'll send you one email the day Rehearsal Block launches. No other emails, no marketing list.</p>
        <button type="button" class="primary-btn" onclick={onclose}>Close</button>
      </div>
    {:else}
      <p class="intro">
        Rehearsal Block is in active development. Drop your email and I'll let you know the moment it's ready to buy.
      </p>

      <form onsubmit={submit} novalidate>
        <!-- Honeypot: hidden from real users. Bots filling every field
             trip this and their submission is discarded by Netlify. -->
        <label class="honeypot" aria-hidden="true">
          Don't fill this out: <input type="text" name="bot-field" bind:value={botField} tabindex="-1" autocomplete="off" />
        </label>

        <div class="field">
          <label for="notify-name">Name <span class="optional">(optional)</span></label>
          <input
            id="notify-name"
            type="text"
            bind:value={name}
            autocomplete="name"
            placeholder="Your name"
          />
        </div>

        <div class="field">
          <label for="notify-email">Email</label>
          <input
            id="notify-email"
            type="email"
            bind:value={email}
            autocomplete="email"
            placeholder="you@example.com"
            required
          />
        </div>

        {#if status === "error"}
          <p class="error-msg">{errorMsg}</p>
        {/if}

        <div class="actions">
          <button type="button" class="ghost-btn" onclick={onclose}>Cancel</button>
          <button type="submit" class="primary-btn" disabled={status === "submitting"}>
            {status === "submitting" ? "Sending..." : "Notify me"}
          </button>
        </div>
      </form>
    {/if}
  </div>
</div>

<style>
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
    font-size: 0.875rem;
    color: var(--color-text-muted);
    line-height: 1.5;
    margin: 0 0 var(--space-4);
  }

  .honeypot {
    position: absolute;
    left: -9999px;
    width: 1px;
    height: 1px;
    overflow: hidden;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    margin-bottom: var(--space-3);
  }
  .field label {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--color-text);
  }
  .field .optional {
    color: var(--color-text-muted);
    font-weight: 400;
  }
  .field input {
    font: inherit;
    font-size: 0.875rem;
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: var(--color-surface);
    color: var(--color-text);
  }
  .field input:focus {
    outline: 2px solid var(--color-plum);
    outline-offset: 1px;
    border-color: var(--color-plum);
  }

  .error-msg {
    font-size: 0.8125rem;
    color: var(--color-danger);
    margin: 0 0 var(--space-3);
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2);
    margin-top: var(--space-4);
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
  .primary-btn:hover:not(:disabled) {
    background: var(--color-plum-dark, #1f1529);
  }
  .primary-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .success {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-4) 0;
    text-align: center;
  }
  .success svg {
    color: var(--color-teal);
  }
  .success-title {
    font-size: 1rem;
    font-weight: 700;
    color: var(--color-text);
    margin: 0;
  }
  .success-hint {
    font-size: 0.8125rem;
    color: var(--color-text-muted);
    margin: 0 0 var(--space-2);
    max-width: 320px;
    line-height: 1.5;
  }
</style>
