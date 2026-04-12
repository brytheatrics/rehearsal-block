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

  /* Hamburger menu dropdown state. Visible at ALL viewport widths now
     (previously mobile-only). Closes on navigation, on outside click,
     and on Escape. */
  let menuOpen = $state(false);

  function toggleMenu(e: MouseEvent) {
    /* Stop the click from reaching the window handler, which would see
       the freshly-opened state and immediately close it again. */
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
    if (target.closest(".menu-toggle") || target.closest(".menu-dropdown")) return;
    menuOpen = false;
  }

  function handleWindowKey(e: KeyboardEvent) {
    if (e.key === "Escape" && menuOpen) menuOpen = false;
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
    <header class="app-header" class:menu-is-open={menuOpen}>
      <div class="container header-inner">
        <a href="/" class="brand" onclick={closeMenu}>
          <img src="/rehearsal-block-logo.svg" alt="Rehearsal Block" class="brand-logo" />
        </a>

        <div class="header-right">
          <!--
            Primary nav bar: visible at desktop width (> 768px) only. At mobile
            width it's hidden via @media; the same items move into the hamburger
            dropdown (.menu-primary-mobile) since there's no room for them in
            the 56px mobile header row.
          -->
          <nav class="primary-nav">
            {#if data.user && data.profile?.has_paid}
              <a href="/app" class="nav-link">My Shows</a>
              <form method="POST" action="/login?/signout" class="signout-form">
                <button type="submit" class="nav-email-btn" title="Click to sign out">
                  {data.user.email}
                </button>
              </form>
            {:else if data.user}
              <a href="/buy" class="btn btn-primary">Buy Rehearsal Block</a>
              <form method="POST" action="/login?/signout" class="signout-form">
                <button type="submit" class="nav-email-btn" title="Click to sign out">
                  {data.user.email}
                </button>
              </form>
            {:else}
              <a href="/demo" class="nav-link">Demo</a>
              <span class="nav-link disabled-link" title="Coming soon">Sign In</span>
              <span class="btn btn-primary disabled-link" title="Coming soon">Buy Now</span>
            {/if}
          </nav>

          <!-- Hamburger toggle: visible at ALL widths. -->
          <button
            type="button"
            class="menu-toggle"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            onclick={toggleMenu}
          >
            {#if menuOpen}
              <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            {:else}
              <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" aria-hidden="true">
                <path d="M4 7h16M4 12h16M4 17h16" />
              </svg>
            {/if}
          </button>
        </div>

        <!--
          Hamburger dropdown. Rendered when the menu is open.

          Contents are split into three groups:

          1. .menu-primary-mobile — visible at mobile width only. Duplicates
             the primary nav items (which are hidden on mobile) so users still
             have a way to reach Demo / Sign In / Buy / My Shows when the top
             nav bar collapses.

          2. .menu-secondary — visible at all widths. The static pages (Help,
             Contact, Privacy, Terms) plus Demo when signed in (when signed
             out, Demo is already in the top nav).

          3. .menu-signout — visible only when signed in. Sign out form.
        -->
        {#if menuOpen}
          <div class="menu-dropdown" role="menu">
            <div class="menu-primary-mobile">
              {#if data.user && data.profile?.has_paid}
                <a href="/app" class="menu-item" onclick={closeMenu}>My Shows</a>
                <div class="menu-email-static">Signed in as {data.user.email}</div>
              {:else if data.user}
                <a href="/buy" class="menu-item menu-item-primary" onclick={closeMenu}>Buy Rehearsal Block</a>
                <div class="menu-email-static">Signed in as {data.user.email}</div>
              {:else}
                <a href="/demo" class="menu-item" onclick={closeMenu}>Demo</a>
                <span class="menu-item disabled-link" title="Coming soon">Sign In</span>
                <span class="menu-item menu-item-primary disabled-link" title="Coming soon">Buy Now</span>
              {/if}
              <div class="menu-divider"></div>
            </div>

            <div class="menu-secondary">
              {#if data.user}
                <a href="/demo" class="menu-item" onclick={closeMenu}>Demo</a>
              {/if}
              <a href="/help" class="menu-item" onclick={closeMenu}>Help</a>
              <a href="/contact" class="menu-item" onclick={closeMenu}>Contact</a>
              <a href="/privacy" class="menu-item" onclick={closeMenu}>Privacy</a>
              <a href="/terms" class="menu-item" onclick={closeMenu}>Terms</a>
            </div>

            {#if data.user}
              <div class="menu-divider"></div>
              <form method="POST" action="/login?/signout" class="menu-signout-form">
                <button type="submit" class="menu-item menu-item-signout">
                  Sign out
                </button>
              </form>
            {/if}
          </div>
        {/if}
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
    position: relative;
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

  /* Right side of the header: primary nav + hamburger toggle, grouped
     together so they stay aligned on the right edge. */
  .header-right {
    display: flex;
    align-items: center;
    gap: var(--space-4);
  }

  /* Primary nav: visible at desktop width (> 768px). Hidden on mobile via
     the @media rule below. Contains the common actions (Demo/Sign In/Buy
     when signed out, My Shows + email when signed in). */
  .primary-nav {
    display: flex;
    align-items: center;
    gap: var(--space-5);
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

  .disabled-link {
    opacity: 0.45;
    cursor: not-allowed;
    pointer-events: none;
    user-select: none;
  }

  /* Signout form wrapper - shrinks the form to size of button only. */
  .signout-form {
    display: inline-flex;
    margin: 0;
  }

  /* Email shown in the desktop primary nav. Rendered as a button because
     clicking it signs the user out. The title attribute communicates this. */
  .nav-email-btn {
    background: none;
    border: none;
    padding: 0;
    margin: 0;
    font: inherit;
    font-size: 0.9375rem;
    font-weight: 500;
    color: var(--color-teal-dark);
    cursor: pointer;
    transition: color var(--transition-fast);
  }
  .nav-email-btn:hover {
    color: var(--color-teal);
    text-decoration: underline;
  }

  /* Hamburger toggle: visible at ALL widths now (previously mobile-only). */
  .menu-toggle {
    display: inline-flex;
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
  .menu-toggle:hover {
    background: rgba(0, 0, 0, 0.04);
  }

  /* Hamburger dropdown. Absolutely positioned relative to the header so it
     overlays content below without pushing the layout down. On desktop it
     anchors to the right; on mobile it spans full width (see @media below). */
  .menu-dropdown {
    position: absolute;
    top: 100%;
    right: var(--space-5);
    min-width: 240px;
    background: #ffffff;
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
    font-size: 0.9375rem;
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
  .menu-item.disabled-link {
    opacity: 0.45;
    cursor: not-allowed;
  }

  /* Primary CTA styling inside the hamburger dropdown (mobile-only Buy Now,
     Buy Rehearsal Block). */
  .menu-item-primary {
    color: var(--color-teal-dark);
    font-weight: 600;
  }

  /* Sign out button - same geometry as other items but red accent. */
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

  .menu-divider {
    height: 1px;
    background: var(--color-border);
    margin: var(--space-2) 0;
  }

  /* Email shown inside the mobile dropdown (as static info, not clickable,
     because the Sign out button is separately available below). */
  .menu-email-static {
    padding: var(--space-1) var(--space-4) var(--space-2);
    font-size: 0.75rem;
    color: var(--color-text-muted);
  }

  /* Hide the mobile-only primary group at desktop width. The top primary
     nav bar is already visible there. */
  @media (min-width: 769px) {
    .menu-primary-mobile {
      display: none;
    }
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

  /* ---- Mobile: hide the primary nav, reduce header height, make the
     hamburger dropdown full-width. ---- */
  @media (max-width: 768px) {
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
    .primary-nav {
      display: none;
    }
    /* Full-width dropdown overlay, drops down below the header row. */
    .menu-dropdown {
      left: 0;
      right: 0;
      top: 56px;
      border-radius: 0;
      border-left: none;
      border-right: none;
      min-width: 0;
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
