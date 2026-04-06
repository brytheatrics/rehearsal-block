<script lang="ts">
  import "../app.css";
  import { invalidate } from "$app/navigation";
  import { onMount } from "svelte";

  let { data, children } = $props();

  onMount(() => {
    const { data: sub } = data.supabase.auth.onAuthStateChange((_event, newSession) => {
      if (newSession?.expires_at !== data.session?.expires_at) {
        invalidate("supabase:auth");
      }
    });
    return () => sub.subscription.unsubscribe();
  });
</script>

<div class="app-shell">
  <header class="app-header">
    <div class="container header-inner">
      <a href="/" class="brand">
        <img src="/rehearsal-block-logo.svg" alt="Rehearsal Block" class="brand-logo" />
      </a>
      <nav class="nav">
        {#if data.user && data.profile?.has_paid}
          <a href="/app" class="nav-link">My Shows</a>
          <span class="nav-email">{data.user.email}</span>
        {:else if data.user}
          <a href="/buy" class="btn btn-primary">Buy Rehearsal Block</a>
        {:else}
          <a href="/demo" class="nav-link">Demo</a>
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
        <img src="/bry-theatrics-logo.png" alt="BRY Theatrics" class="footer-logo" />
        <span>by <strong>BRY Theatrics</strong></span>
      </div>
      <div class="footer-meta">
        <span>&copy; {new Date().getFullYear()} BRY Theatrics</span>
      </div>
    </div>
  </footer>
</div>

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
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-4);
  }

  .footer-brand {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    font-size: 0.875rem;
  }

  .footer-logo {
    width: 40px;
    height: 40px;
    border-radius: var(--radius-sm);
  }

  .footer-meta {
    font-size: 0.875rem;
    opacity: 0.7;
  }

  @media (max-width: 640px) {
    .header-inner {
      flex-direction: column;
      height: auto;
      padding-top: var(--space-3);
      padding-bottom: var(--space-3);
      gap: var(--space-3);
    }
    .nav {
      gap: var(--space-3);
    }
    .footer-inner {
      flex-direction: column;
      text-align: center;
    }
  }
</style>
