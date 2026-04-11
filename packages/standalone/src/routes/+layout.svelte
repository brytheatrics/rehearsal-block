<script lang="ts">
  import "../app.css";
  import { invalidate } from "$app/navigation";
  import { page } from "$app/state";
  import { onMount } from "svelte";

  let { data, children } = $props();

  /** Public pages (view, conflicts) use their own minimal layout - skip the app shell. */
  const isPublicPage = $derived(
    page.url.pathname.startsWith("/view") ||
      page.url.pathname.startsWith("/conflicts"),
  );

  /*
   * Footer contact link. The anchor's default mailto: action still fires
   * (handled natively by the browser, no preventDefault). Alongside that,
   * the click also copies the email to the clipboard and shows a brief
   * "Copied!" confirmation. This gives two positive outcomes:
   *   - Users WITH a mailto handler: mail app opens AND email is in
   *     their clipboard as a bonus if they want to paste it elsewhere.
   *   - Users WITHOUT a handler: the toast confirms the email was
   *     copied so they know they can paste it into whatever mail app
   *     they prefer, even if the mailto itself did nothing visible.
   *
   * navigator.clipboard.writeText() is fire-and-forget - the OS clipboard
   * write is initiated synchronously inside the user-gesture callback,
   * so even if the page navigates to Gmail immediately afterward the
   * clipboard has already been updated.
   */
  const CONTACT_EMAIL = "hello@rehearsalblock.com";
  let copiedEmail = $state(false);
  let copyTimeout: ReturnType<typeof setTimeout> | null = null;

  function handleContactClick() {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(CONTACT_EMAIL).catch(() => {
        // Clipboard may be unavailable (insecure context, permissions).
        // Silently ignore - the mailto: default action still fires.
      });
    }
    copiedEmail = true;
    if (copyTimeout) clearTimeout(copyTimeout);
    copyTimeout = setTimeout(() => {
      copiedEmail = false;
    }, 2200);
  }

  /* Mobile nav dropdown state. Only rendered/used at <= 768px via CSS.
     Closes on navigation, on outside click, or on Escape. */
  let mobileNavOpen = $state(false);

  function toggleMobileNav(e: MouseEvent) {
    /* Stop the click from reaching the window handler, which would see
       the freshly-opened state and immediately close it again. */
    e.stopPropagation();
    mobileNavOpen = !mobileNavOpen;
  }

  function closeMobileNav() {
    mobileNavOpen = false;
  }

  function handleWindowClick(e: MouseEvent) {
    if (!mobileNavOpen) return;
    const target = e.target as HTMLElement | null;
    if (!target) return;
    if (target.closest(".mobile-nav-toggle") || target.closest(".nav")) return;
    mobileNavOpen = false;
  }

  function handleWindowKey(e: KeyboardEvent) {
    if (e.key === "Escape" && mobileNavOpen) mobileNavOpen = false;
  }

  onMount(() => {
    if (isPublicPage || !data.supabase) return;
    const { data: sub } = data.supabase.auth.onAuthStateChange((_event, newSession) => {
      if (newSession?.expires_at !== data.session?.expires_at) {
        invalidate("supabase:auth");
      }
    });
    return () => sub.subscription.unsubscribe();
  });
</script>

<svelte:window onclick={handleWindowClick} onkeydown={handleWindowKey} />

{#if isPublicPage}
  {@render children?.()}
{:else}
  <div class="app-shell">
    <header class="app-header" class:mobile-nav-open={mobileNavOpen}>
      <div class="container header-inner">
        <a href="/" class="brand" onclick={closeMobileNav}>
          <img src="/rehearsal-block-logo.svg" alt="Rehearsal Block" class="brand-logo" />
        </a>

        <button
          type="button"
          class="mobile-nav-toggle"
          aria-label={mobileNavOpen ? "Close menu" : "Open menu"}
          aria-expanded={mobileNavOpen}
          onclick={toggleMobileNav}
        >
          {#if mobileNavOpen}
            <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          {:else}
            <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" aria-hidden="true">
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          {/if}
        </button>

        <nav class="nav" class:nav-open={mobileNavOpen}>
          {#if data.user && data.profile?.has_paid}
            <a href="/app" class="nav-link" onclick={closeMobileNav}>My Shows</a>
            <span class="nav-email">{data.user.email}</span>
          {:else if data.user}
            <a href="/buy" class="btn btn-primary" onclick={closeMobileNav}>Buy Rehearsal Block</a>
          {:else}
            <a href="/demo" class="nav-link" onclick={closeMobileNav}>Demo</a>
            <span class="nav-link disabled-link" title="Coming soon">Sign In</span>
            <span class="btn btn-primary disabled-link" title="Coming soon">Buy Now</span>
          {/if}
        </nav>
      </div>
    </header>

    <main class="app-main">
      {@render children?.()}
    </main>

    <footer class="app-footer">
      <div class="container footer-inner">
        <div class="footer-brand">
          <img src="/bry-theatrics-logo-white.svg" alt="BRY Theatrics" class="footer-logo" />
          <span>by <strong>BRY Theatrics</strong></span>
        </div>
        <div class="footer-contact">
          <span class="footer-contact-label">Get in touch</span>
          <a
            href="mailto:{CONTACT_EMAIL}"
            class="footer-contact-link"
            onclick={handleContactClick}
          >
            {CONTACT_EMAIL}
          </a>
          {#if copiedEmail}
            <span class="footer-contact-copied" aria-live="polite">
              <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor" aria-hidden="true">
                <path d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
              </svg>
              Copied to clipboard
            </span>
          {/if}
        </div>
        <div class="footer-meta">
          <span>&copy; {new Date().getFullYear()} BRY Theatrics</span>
        </div>
      </div>
    </footer>
  </div>
{/if}

<style>
  .app-shell {
    display: flex;
    flex-direction: column;
    min-height: 100vh;
  }

  .app-header {
    background: #ffffff;
    color: var(--color-text);
    border-bottom: none;
  }

  .header-inner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 80px;
    max-width: 2000px;
    margin: 0 auto;
    padding-left: var(--space-5);
    padding-right: var(--space-5);
  }

  .brand {
    color: var(--color-text);
    text-decoration: none;
    font-family: var(--font-display);
    font-weight: 600;
  }
  .brand-logo {
    height: 64px;
    width: auto;
  }
  .brand:hover {
    opacity: 0.85;
    text-decoration: none;
  }

  .nav {
    display: flex;
    align-items: center;
    gap: var(--space-5);
  }

  /* Hamburger toggle: only visible at mobile width via the @media rule
     below. At desktop it's display:none. */
  .mobile-nav-toggle {
    display: none;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--color-text);
    cursor: pointer;
    border-radius: var(--radius-sm);
  }
  .mobile-nav-toggle:hover {
    background: rgba(0, 0, 0, 0.04);
  }

  .nav-link {
    color: var(--color-text);
    text-decoration: none;
    font-weight: 500;
    transition: color var(--transition-fast);
  }
  .nav-link:hover {
    color: var(--color-teal);
    text-decoration: none;
  }

  .nav-email {
    color: var(--color-teal-light);
    font-size: 0.875rem;
  }

  .disabled-link {
    opacity: 0.45;
    cursor: not-allowed;
    pointer-events: none;
    user-select: none;
  }

  .app-main {
    flex: 1;
    padding: var(--space-6) 0;
  }

  .app-footer {
    background: var(--color-plum-dark);
    color: var(--color-text-inverse);
    padding: var(--space-5) 0;
    margin-top: var(--space-8);
  }

  .footer-inner {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    gap: var(--space-5);
  }

  .footer-brand {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    font-size: 0.875rem;
    justify-self: start;
  }

  .footer-logo {
    width: 40px;
    height: 40px;
  }

  .footer-contact {
    position: relative;
    display: flex;
    align-items: baseline;
    gap: var(--space-2);
    justify-self: center;
    font-size: 0.875rem;
    white-space: nowrap;
  }

  .footer-contact-label {
    color: var(--color-teal-light);
    font-weight: 500;
  }

  .footer-contact-link {
    color: var(--color-text-inverse);
    text-decoration: none;
    font-weight: 600;
    border-bottom: 1px solid rgba(255, 255, 255, 0.25);
    transition: border-color var(--transition-fast), color var(--transition-fast);
  }
  .footer-contact-link:hover {
    color: var(--color-teal-light);
    border-bottom-color: var(--color-teal-light);
    text-decoration: none;
  }

  /*
   * "Copied to clipboard" confirmation. Absolutely positioned ABOVE the
   * contact link so it never gets clipped by the footer's bottom edge
   * (which can happen on shorter viewports). Bubbles up from the link
   * with a brief fade-in.
   */
  .footer-contact-copied {
    position: absolute;
    bottom: calc(100% + 6px);
    left: 50%;
    transform: translateX(-50%);
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 4px 10px;
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--color-plum-dark);
    background: var(--color-teal-light);
    border-radius: var(--radius-full);
    white-space: nowrap;
    animation: copied-in 200ms ease;
    pointer-events: none;
  }
  @keyframes copied-in {
    from {
      opacity: 0;
      transform: translateX(-50%) translateY(4px);
    }
    to {
      opacity: 1;
      transform: translateX(-50%) translateY(0);
    }
  }

  .footer-meta {
    font-size: 0.875rem;
    opacity: 0.7;
    justify-self: end;
  }

  /* ---- Mobile header: logo left, hamburger right, nav collapses into
     a dropdown underneath the header row. ---- */
  @media (max-width: 768px) {
    .app-header {
      position: relative;
    }
    .header-inner {
      height: 56px;
      padding-left: var(--space-4);
      padding-right: var(--space-2);
    }
    .brand-logo {
      height: 32px;
      max-width: 180px;
      object-fit: contain;
      object-position: left center;
    }
    .mobile-nav-toggle {
      display: inline-flex;
    }
    /* Nav becomes a dropdown panel: hidden by default, shown when the
       hamburger opens it. Absolutely positioned so it overlays content
       below without pushing the layout down. */
    .nav {
      position: absolute;
      top: 56px;
      left: 0;
      right: 0;
      flex-direction: column;
      align-items: stretch;
      gap: 0;
      background: #ffffff;
      border-bottom: 1px solid var(--color-border);
      box-shadow: 0 6px 16px rgba(15, 10, 25, 0.08);
      padding: var(--space-2) var(--space-4);
      z-index: 20;
      display: none;
    }
    .nav.nav-open {
      display: flex;
    }
    .nav .nav-link,
    .nav .btn,
    .nav .nav-email {
      padding: var(--space-3) 0;
      border-bottom: 1px solid var(--color-border);
      text-align: left;
      font-size: 1rem;
    }
    .nav :last-child {
      border-bottom: none;
    }
    /* Primary button keeps its teal background but drops the inline
       treatment - still readable and tappable at full width. */
    .nav .btn.btn-primary {
      border-bottom: 1px solid var(--color-border);
      background: transparent;
      color: var(--color-text);
    }
  }

  @media (max-width: 640px) {
    .footer-inner {
      grid-template-columns: 1fr;
      text-align: center;
      gap: var(--space-3);
    }
    .footer-brand,
    .footer-contact,
    .footer-meta {
      justify-self: center;
    }
    .footer-contact {
      flex-direction: column;
      gap: 2px;
    }
  }
</style>
