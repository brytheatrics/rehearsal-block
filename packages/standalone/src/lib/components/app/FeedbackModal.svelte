<script lang="ts">
  /**
   * Beta-tester feedback form. Opens from BetaBanner's "Send Feedback" button.
   * POSTs to /api/beta/feedback which inserts a row in beta_feedback.
   */

  let { onclose }: { onclose: () => void } = $props();

  let rating = $state<number | null>(null);
  let body = $state("");
  let submitting = $state(false);
  let submitted = $state(false);
  let errorMsg = $state("");

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    if (submitting) return;
    const trimmed = body.trim();
    if (!trimmed) {
      errorMsg = "Add a short note so we know what the feedback is about.";
      return;
    }
    submitting = true;
    errorMsg = "";
    try {
      const res = await fetch("/api/beta/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rating,
          body: trimmed,
          userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
        }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        errorMsg = typeof payload?.error === "string"
          ? payload.error
          : "Couldn't send feedback. Try again.";
        return;
      }
      submitted = true;
      setTimeout(onclose, 1500);
    } catch {
      errorMsg = "Network error. Try again.";
    } finally {
      submitting = false;
    }
  }

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) onclose();
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="backdrop" onclick={handleBackdropClick}>
  <div class="modal" role="dialog" aria-labelledby="feedback-title">
    <button type="button" class="close-btn" aria-label="Close" onclick={onclose}>&times;</button>

    {#if submitted}
      <div class="thanks">
        <svg width="40" height="40" viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true">
          <path d="M382-240 154-468l57-57 171 171 367-367 57 57-424 424Z"/>
        </svg>
        <p>Thanks! Your feedback is on its way.</p>
      </div>
    {:else}
      <h2 id="feedback-title">Beta feedback</h2>
      <p class="lede">
        What's working, what's broken, or what would make Rehearsal Block better for you?
      </p>

      <form onsubmit={submit}>
        <fieldset class="rating">
          <legend>How's it going overall? (optional)</legend>
          <div class="stars">
            {#each [1, 2, 3, 4, 5] as n (n)}
              <button
                type="button"
                class="star"
                class:star-active={rating !== null && n <= rating}
                aria-label={`${n} star${n === 1 ? "" : "s"}`}
                aria-pressed={rating === n}
                onclick={() => (rating = rating === n ? null : n)}
              >
                ★
              </button>
            {/each}
          </div>
        </fieldset>

        <label for="feedback-body">Your feedback</label>
        <textarea
          id="feedback-body"
          bind:value={body}
          rows="6"
          placeholder="Anything you noticed, liked, or want changed..."
          disabled={submitting}
        ></textarea>

        {#if errorMsg}
          <div class="error-message">{errorMsg}</div>
        {/if}

        <div class="actions">
          <button type="button" class="btn-ghost" onclick={onclose} disabled={submitting}>
            Cancel
          </button>
          <button type="submit" class="btn-primary" disabled={submitting}>
            {submitting ? "Sending..." : "Send feedback"}
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
    background: rgba(0, 0, 0, 0.45);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-4);
    z-index: 100;
  }
  .modal {
    position: relative;
    width: 100%;
    max-width: 480px;
    background: var(--color-surface);
    border-radius: var(--radius-lg);
    padding: var(--space-6);
    box-shadow: var(--shadow-xl, 0 20px 40px rgba(0, 0, 0, 0.25));
  }
  .close-btn {
    position: absolute;
    top: var(--space-3);
    right: var(--space-3);
    background: transparent;
    border: none;
    font-size: 1.5rem;
    line-height: 1;
    color: var(--color-text-muted);
    cursor: pointer;
    padding: 4px 8px;
    border-radius: var(--radius-sm);
  }
  .close-btn:hover {
    background: var(--color-bg-alt);
    color: var(--color-text);
  }
  h2 {
    margin: 0 0 var(--space-2);
    font-size: 1.25rem;
    color: var(--color-plum);
  }
  .lede {
    margin: 0 0 var(--space-4);
    color: var(--color-text-muted);
    font-size: 0.9375rem;
    line-height: 1.5;
  }
  .rating {
    border: none;
    padding: 0;
    margin: 0 0 var(--space-4);
  }
  .rating legend {
    font-size: 0.8125rem;
    color: var(--color-text-muted);
    margin-bottom: var(--space-1);
  }
  .stars {
    display: flex;
    gap: var(--space-1);
  }
  .star {
    background: none;
    border: none;
    font-size: 1.75rem;
    line-height: 1;
    color: var(--color-border-strong);
    cursor: pointer;
    padding: 2px 4px;
    transition: color 80ms ease;
  }
  .star:hover,
  .star-active {
    color: var(--color-teal);
  }
  label {
    display: block;
    font-weight: 600;
    margin-bottom: var(--space-2);
    font-size: 0.875rem;
  }
  textarea {
    width: 100%;
    padding: var(--space-3);
    border: 1px solid var(--color-border-strong);
    border-radius: var(--radius-md);
    font: inherit;
    font-size: 0.9375rem;
    resize: vertical;
    margin-bottom: var(--space-3);
  }
  textarea:focus {
    outline: none;
    border-color: var(--color-teal);
    box-shadow: 0 0 0 3px rgba(46, 154, 143, 0.15);
  }
  .error-message {
    color: var(--color-danger);
    background: var(--color-danger-bg);
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-md);
    margin-bottom: var(--space-3);
    font-size: 0.875rem;
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-3);
  }
  .btn-ghost,
  .btn-primary {
    padding: var(--space-2) var(--space-4);
    border-radius: var(--radius-md);
    font-weight: 600;
    font-size: 0.9375rem;
    cursor: pointer;
    border: 1px solid transparent;
  }
  .btn-ghost {
    background: transparent;
    color: var(--color-text);
    border-color: var(--color-border-strong);
  }
  .btn-ghost:hover:not(:disabled) {
    background: var(--color-bg-alt);
  }
  .btn-primary {
    background: var(--color-teal);
    color: #fff;
  }
  .btn-primary:hover:not(:disabled) {
    background: var(--color-teal-dark, #2e6b68);
  }
  button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
  .thanks {
    text-align: center;
    color: var(--color-teal);
    padding: var(--space-4) 0;
  }
  .thanks p {
    margin: var(--space-2) 0 0;
    color: var(--color-text);
    font-weight: 500;
  }
</style>
