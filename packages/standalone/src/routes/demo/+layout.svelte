<script lang="ts">
  /**
   * Demo layout. For anonymous visitors, this is transparent - the root
   * +layout.svelte renders the marketing shell. For signed-in users
   * (and localhost for dev preview), the root layout is skipped and
   * this layout renders the minimal app-style header instead.
   */
  import { page } from "$app/state";

  let { data, children } = $props();

  const isSignedInOnLocalhost =
    typeof window !== "undefined" &&
    (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");
  const isSignedIn = $derived(!!(data as any).user || isSignedInOnLocalhost);

  let menuOpen = $state(false);

  function toggleMenu(e: MouseEvent) {
    e.stopPropagation();
    menuOpen = !menuOpen;
  }

  function closeMenu() {
    menuOpen = false;
  }

  function handleWindowClick(e: MouseEvent) {
    if (!menuOpen) return;
    const target = e.target as HTMLElement | null;
    if (!target) return;
    if (target.closest(".app-menu-toggle") || target.closest(".app-menu-dropdown")) return;
    menuOpen = false;
  }

  function handleWindowKey(e: KeyboardEvent) {
    if (e.key === "Escape" && menuOpen) menuOpen = false;
  }
</script>

<svelte:window
  onclick={isSignedIn ? handleWindowClick : undefined}
  onkeydown={isSignedIn ? handleWindowKey : undefined}
/>

{#if isSignedIn}
  <div class="app-shell">
    <header class="app-header">
      <div class="header-inner">
        <div class="header-left">
          <a href="/app" class="brand" onclick={closeMenu}>
            <img src="/rehearsal-block-logo.svg" alt="Rehearsal Block" class="brand-logo" />
          </a>
          <span class="show-title-divider">/</span>
          <span class="show-title">Demo</span>
        </div>

        <div class="menu-wrap">
          <button
            type="button"
            class="app-menu-toggle"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            onclick={toggleMenu}
          >
            {#if menuOpen}
              <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            {:else}
              <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" aria-hidden="true">
                <path d="M4 7h16M4 12h16M4 17h16" />
              </svg>
            {/if}
          </button>

          {#if menuOpen}
            <div class="app-menu-dropdown" role="menu">
              <a href="/app" class="menu-item" onclick={closeMenu}>My Shows</a>
              <a href="/demo" class="menu-item" onclick={closeMenu}>Demo</a>
              <div class="menu-divider"></div>
              <a href="/help" class="menu-item" onclick={closeMenu}>Help</a>
              <a href="/contact" class="menu-item" onclick={closeMenu}>Contact</a>
              <a href="/privacy" class="menu-item" onclick={closeMenu}>Privacy</a>
              <a href="/terms" class="menu-item" onclick={closeMenu}>Terms</a>
              {#if data.user}
                <div class="menu-divider"></div>
                <a href="/app/account" class="menu-item" onclick={closeMenu}>Account</a>
                <div class="menu-email">{data.user.email}</div>
                <form method="POST" action="/login?/signout" class="menu-signout-form">
                  <button type="submit" class="menu-item menu-item-signout" onclick={closeMenu}>
                    Sign out
                  </button>
                </form>
              {/if}
            </div>
          {/if}
        </div>
      </div>
    </header>

    <main class="app-main">
      {@render children?.()}
    </main>
  </div>
{:else}
  {@render children?.()}
{/if}

<style>
  .app-shell {
    display: flex;
    flex-direction: column;
    min-height: 100vh;
  }

  .app-header {
    height: 48px;
    background: var(--color-surface);
    border-bottom: 1px solid var(--color-border);
    flex-shrink: 0;
  }

  .header-inner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 100%;
    max-width: 2000px;
    margin: 0 auto;
    padding: 0 var(--space-4);
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-width: 0;
  }

  .brand {
    display: flex;
    align-items: center;
    text-decoration: none;
    flex-shrink: 0;
  }
  .brand:hover {
    opacity: 0.85;
  }
  .brand-logo {
    height: 28px;
    width: auto;
  }

  .show-title-divider {
    color: var(--color-text-muted);
    font-size: 1.125rem;
    font-weight: 300;
    margin: 0 var(--space-1);
  }

  .show-title {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--color-text);
  }

  .menu-wrap {
    position: relative;
    display: inline-flex;
  }

  .app-menu-toggle {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--color-text);
    cursor: pointer;
    border-radius: var(--radius-sm);
  }
  .app-menu-toggle:hover {
    background: rgba(0, 0, 0, 0.04);
  }

  .app-menu-dropdown {
    position: absolute;
    top: calc(100% + 4px);
    right: 0;
    min-width: 200px;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-lg);
    padding: var(--space-2) 0;
    z-index: 30;
  }

  .menu-item {
    display: block;
    width: 100%;
    padding: var(--space-2) var(--space-4);
    color: var(--color-text);
    text-decoration: none;
    font-weight: 500;
    font-size: 0.875rem;
    background: none;
    border: none;
    text-align: left;
    cursor: pointer;
    font-family: inherit;
  }
  .menu-item:hover {
    background: var(--color-bg-alt);
    color: var(--color-teal);
    text-decoration: none;
  }

  .menu-item-signout {
    color: var(--color-danger);
  }
  .menu-item-signout:hover {
    background: var(--color-danger-bg);
    color: var(--color-danger);
  }

  .menu-signout-form {
    display: block;
    margin: 0;
    padding: 0;
  }

  .menu-email {
    padding: var(--space-1) var(--space-4);
    font-size: 0.75rem;
    color: var(--color-text-muted);
  }

  .menu-divider {
    height: 1px;
    background: var(--color-border);
    margin: var(--space-2) 0;
  }

  .app-main {
    flex: 1;
    padding: var(--space-5) 0;
  }

  @media (max-width: 768px) {
    .header-inner {
      padding: 0 var(--space-3);
    }
    .brand-logo {
      height: 24px;
    }
    .app-menu-dropdown {
      position: fixed;
      top: 48px;
      left: 0;
      right: 0;
      border-radius: 0;
      border-left: none;
      border-right: none;
      min-width: 0;
    }
  }
</style>
