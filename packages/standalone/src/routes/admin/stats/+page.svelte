<script lang="ts">
  let { data } = $props();
</script>

<svelte:head>
  <title>Admin Stats - Rehearsal Block</title>
</svelte:head>

<div class="stats-page container-sm">
  <h1>Stats (last 30 days)</h1>

  <section class="card">
    <h2>Users & Shows</h2>
    <div class="stat-grid">
      <div class="stat">
        <span class="stat-value">{data.totalUsers}</span>
        <span class="stat-label">Total users</span>
      </div>
      <div class="stat">
        <span class="stat-value">{data.paidUsers}</span>
        <span class="stat-label">Paid users</span>
      </div>
      <div class="stat">
        <span class="stat-value">{data.totalShows}</span>
        <span class="stat-label">Total shows</span>
      </div>
    </div>
  </section>

  <section class="card">
    <h2>Page Views</h2>
    <p class="stat-summary">{data.totalPageViews} total views</p>
    <table class="stat-table">
      <thead>
        <tr><th>Path</th><th>Views</th></tr>
      </thead>
      <tbody>
        {#each Object.entries(data.viewsByPath).sort((a, b) => b[1] - a[1]) as [path, count]}
          <tr>
            <td><code>{path}</code></td>
            <td>{count}</td>
          </tr>
        {/each}
        {#if Object.keys(data.viewsByPath).length === 0}
          <tr><td colspan="2" class="empty">No page views yet</td></tr>
        {/if}
      </tbody>
    </table>
  </section>

  <section class="card">
    <h2>Demo Sessions</h2>
    <div class="stat-grid">
      <div class="stat">
        <span class="stat-value">{data.demoSessionCount}</span>
        <span class="stat-label">Sessions</span>
      </div>
      <div class="stat">
        <span class="stat-value">{Math.floor(data.avgDemoSeconds / 60)}:{String(data.avgDemoSeconds % 60).padStart(2, "0")}</span>
        <span class="stat-label">Avg duration</span>
      </div>
      <div class="stat">
        <span class="stat-value">{data.avgDemoInteractions}</span>
        <span class="stat-label">Avg interactions</span>
      </div>
    </div>
  </section>
</div>

<style>
  .stats-page {
    padding: var(--space-6) var(--space-4);
    max-width: 640px;
  }

  h1 {
    font-family: var(--font-display);
    color: var(--color-plum);
    margin: 0 0 var(--space-5);
  }

  .card {
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    padding: var(--space-4) var(--space-5);
    margin-bottom: var(--space-4);
  }

  .card h2 {
    font-size: 0.875rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--color-text-muted);
    margin: 0 0 var(--space-3);
  }

  .stat-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: var(--space-3);
  }

  .stat {
    text-align: center;
  }

  .stat-value {
    display: block;
    font-size: 1.75rem;
    font-weight: 700;
    color: var(--color-plum);
    font-family: var(--font-display);
  }

  .stat-label {
    font-size: 0.75rem;
    color: var(--color-text-muted);
  }

  .stat-summary {
    font-size: 0.875rem;
    color: var(--color-text-muted);
    margin: 0 0 var(--space-3);
  }

  .stat-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.8125rem;
  }

  .stat-table th {
    text-align: left;
    font-weight: 600;
    color: var(--color-text-muted);
    border-bottom: 2px solid var(--color-border);
    padding: var(--space-2) var(--space-2);
  }

  .stat-table td {
    padding: var(--space-2);
    border-bottom: 1px solid var(--color-border);
  }

  .stat-table td:last-child {
    text-align: right;
    font-weight: 600;
  }

  .empty {
    text-align: center;
    color: var(--color-text-subtle);
    font-style: italic;
  }

  code {
    font-size: 0.75rem;
    background: var(--color-bg-alt);
    padding: 1px 4px;
    border-radius: 3px;
  }
</style>
