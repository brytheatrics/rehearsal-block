<script lang="ts">
  let { data } = $props();
</script>

<svelte:head>
  <title>Rehearsal Block - Scheduling for theatre directors and stage managers</title>
</svelte:head>

<section class="hero">
  <div class="container-sm hero-inner">
    <h1 class="hero-title">Rehearsal scheduling that doesn't fight you.</h1>
    <p class="hero-lede">
      Build your production calendar, manage your cast, and print clean schedules in minutes.
      Designed by a theatre director, for theatre directors and stage managers.
    </p>

    <div class="hero-actions">
      <a href="/demo" class="btn btn-primary btn-lg">Try the Demo</a>
      {#if !data.user}
        <a href="/buy" class="btn btn-secondary btn-lg">Buy - $50</a>
      {:else if !data.profile?.has_paid}
        <a href="/buy" class="btn btn-secondary btn-lg">Buy - $50</a>
      {:else}
        <a href="/app" class="btn btn-secondary btn-lg">Go to your shows</a>
      {/if}
    </div>

    <p class="hero-subtle">
      One-time purchase. Unlimited shows. Works offline.
    </p>
  </div>
</section>

<section class="features container">
  <div class="feature-grid">
    <div class="feature">
      <h3>Calendar-first</h3>
      <p>See your whole production at a glance. Drag actors onto days. Conflicts are flagged automatically.</p>
    </div>
    <div class="feature">
      <h3>Dress + Performance mode</h3>
      <p>Multiple call times per day - crew, actors, orchestra, whoever. Curtain time front and center.</p>
    </div>
    <div class="feature">
      <h3>Print that actually works</h3>
      <p>Calendar view in landscape, list view in portrait. PDF export with your show name as the filename.</p>
    </div>
    <div class="feature">
      <h3>Your data, your devices</h3>
      <p>Sign in with Google to sync across laptop, phone, and desktop. Works offline on spotty rehearsal wifi.</p>
    </div>
  </div>
</section>

<style>
  .hero {
    padding: var(--space-8) 0 var(--space-7);
    text-align: center;
  }

  .hero-inner {
    max-width: 720px;
  }

  .hero-title {
    font-size: 3rem;
    margin-bottom: var(--space-4);
    line-height: 1.1;
  }

  .hero-lede {
    font-size: 1.25rem;
    color: var(--color-text-muted);
    margin-bottom: var(--space-6);
  }

  .hero-actions {
    display: flex;
    gap: var(--space-3);
    justify-content: center;
    margin-bottom: var(--space-4);
    flex-wrap: wrap;
  }

  .hero-subtle {
    color: var(--color-text-subtle);
    font-size: 0.875rem;
  }

  .features {
    padding: var(--space-7) 0;
  }

  .feature-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    gap: var(--space-6);
  }

  .feature h3 {
    color: var(--color-plum);
    font-size: 1.25rem;
    margin-bottom: var(--space-2);
  }

  .feature p {
    color: var(--color-text-muted);
    margin: 0;
  }

  @media (max-width: 640px) {
    .hero-title {
      font-size: 2rem;
    }
    .hero-lede {
      font-size: 1rem;
    }
  }
</style>
