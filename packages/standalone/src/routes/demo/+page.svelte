<script lang="ts">
  /**
   * Demo page - thin wrapper around ScheduleEditor.
   *
   * Two modes:
   * - Anonymous visitors: teal demo banners, paywall modals, marketing
   *   header/footer from root layout, "Buy" and "Notify" CTAs.
   * - Signed-in users: no demo banners, app-style header (the root
   *   layout is already skipped for /app, but /demo still uses it),
   *   "Reset demo" button when they've made edits.
   */
  import { PaywallError } from "$lib/storage";
  import { demoStorage } from "$lib/storage/demo";
  import { sampleShow } from "@rehearsal-block/core";
  import ScheduleEditor from "$lib/components/scheduler/ScheduleEditor.svelte";
  import ComingSoonModal from "$lib/components/ComingSoonModal.svelte";
  import NotifyLaunchModal from "$lib/components/NotifyLaunchModal.svelte";

  let { data } = $props();

  let paywallOpen = $state(false);
  let notifyLaunchOpen = $state(false);
  let comingSoonOpen = $state(false);
  let hasEdits = $state(false);
  let editorKey = $state(0); // increment to force re-mount of ScheduleEditor

  const isDeployedDemo =
    typeof window !== "undefined" && window.location.hostname !== "localhost";

  /** True when the user is signed in (or on localhost for dev testing).
   *  Localhost has no real auth, but we treat it as signed-in so the
   *  signed-in demo experience can be previewed during development. */
  const isSignedIn = $derived(!!(data as any).user || !isDeployedDemo);

  async function handleSave(doc: import("@rehearsal-block/core").ScheduleDoc) {
    try {
      await demoStorage.saveShow({
        id: "demo",
        name: doc.show.name,
        updatedAt: new Date().toISOString(),
        document: doc,
      });
    } catch (err) {
      if (err instanceof PaywallError) {
        paywallOpen = true;
      } else {
        throw err;
      }
    }
  }

  function handleDocChange() {
    hasEdits = true;
  }

  function resetDemo() {
    hasEdits = false;
    editorKey++;
  }

  function closePaywall() {
    paywallOpen = false;
  }
</script>

<svelte:head>
  <title>Demo - Rehearsal Block</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Playfair+Display:wght@400;600;700&family=Roboto:wght@400;500;700&family=Lato:wght@400;700&family=Merriweather:wght@400;700&family=Open+Sans:wght@400;600;700&family=Questrial&display=swap" />
</svelte:head>

<div class="demo-page">
  {#if !isSignedIn}
    <div class="demo-banner">
      <div class="banner-text">
        <strong>You're in demo mode.</strong> Explore a sample show. Changes stay on this page.
        <button type="button" class="notify-link" onclick={() => (notifyLaunchOpen = true)}>
          Notify me when it launches
        </button>
      </div>
    </div>
  {/if}

  {#key editorKey}
    <ScheduleEditor
      initialDoc={data.show}
      readOnly={isDeployedDemo && !isSignedIn}
      onSave={handleSave}
      onPaywall={() => (paywallOpen = true)}
      onDocChange={handleDocChange}
      showDemoBanners={!isSignedIn}
      showResetButton={isSignedIn && hasEdits}
      onReset={resetDemo}
    />
  {/key}

  {#if !isSignedIn}
    <div class="demo-banner demo-banner-bottom">
      <div class="banner-text">
        <strong>You're in demo mode.</strong> Explore a sample show. Changes stay on this page.
        <button type="button" class="notify-link" onclick={() => (notifyLaunchOpen = true)}>
          Notify me when it launches
        </button>
      </div>
      <button
        type="button"
        class="btn btn-primary"
        onclick={() => (comingSoonOpen = true)}
      >
        Buy Rehearsal Block
      </button>
    </div>
  {/if}
</div>

{#if paywallOpen}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="modal-backdrop"
    role="button"
    tabindex="0"
    onclick={closePaywall}
    onkeydown={(e) => e.key === "Escape" && closePaywall()}
  >
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="modal"
      role="dialog"
      aria-modal="true"
      tabindex="-1"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => e.stopPropagation()}
    >
      <h2>Buy Rehearsal Block to continue</h2>
      <p>
        This feature requires a paid account. Saving, exporting, editing show
        details, managing groups, and more are all included. Rehearsal Block is
        a one-time $50 purchase - no subscription, no recurring fees, unlimited
        shows forever.
      </p>
      <div class="modal-actions">
        <button type="button" class="btn btn-secondary" onclick={closePaywall}>
          Keep exploring
        </button>
        <button
          type="button"
          class="btn btn-primary"
          onclick={() => {
            closePaywall();
            comingSoonOpen = true;
          }}
        >
          Buy Rehearsal Block
        </button>
      </div>
    </div>
  </div>
{/if}

{#if comingSoonOpen}
  <ComingSoonModal
    context="purchase"
    onclose={() => (comingSoonOpen = false)}
    onnotify={() => {
      comingSoonOpen = false;
      notifyLaunchOpen = true;
    }}
  />
{/if}

{#if notifyLaunchOpen}
  <NotifyLaunchModal source="demo" onclose={() => (notifyLaunchOpen = false)} />
{/if}

<style>
  .demo-page {
    width: 100%;
  }

  .demo-banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-4);
    background: var(--color-info-bg);
    border: 1px solid var(--color-teal);
    border-radius: var(--radius-md);
    padding: var(--space-3) var(--space-5);
    margin-bottom: var(--space-5);
    max-width: 2000px;
    margin-left: auto;
    margin-right: auto;
  }

  .banner-text {
    color: var(--color-plum);
    font-size: 0.875rem;
  }

  .notify-link {
    display: inline-block;
    margin-left: var(--space-2);
    font: inherit;
    font-size: 0.8125rem;
    background: transparent;
    border: none;
    color: var(--color-teal);
    text-decoration: underline;
    text-underline-offset: 3px;
    cursor: pointer;
    padding: 0;
  }
  .notify-link:hover {
    color: var(--color-plum);
  }

  .demo-banner-bottom {
    margin-top: var(--space-5);
    margin-bottom: 0;
  }

  .modal-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    z-index: 100;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .modal {
    background: var(--color-surface);
    border-radius: var(--radius-lg);
    padding: var(--space-6);
    max-width: 480px;
    width: 90%;
    box-shadow: var(--shadow-lg);
  }

  .modal h2 {
    margin: 0 0 var(--space-3) 0;
    font-size: 1.25rem;
  }

  .modal p {
    margin: 0 0 var(--space-5) 0;
    color: var(--color-text-muted);
    line-height: 1.6;
  }

  .modal-actions {
    display: flex;
    gap: var(--space-3);
    justify-content: flex-end;
  }
</style>
