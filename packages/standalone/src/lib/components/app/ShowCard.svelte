<script lang="ts">
  import { formatUsDateRange } from "@rehearsal-block/core";

  interface Props {
    id: string;
    name: string;
    startDate: string; // ISO date
    endDate: string;   // ISO date
    castCount: number;
    updatedAt: string; // ISO datetime
    archived: boolean;
    onopen: (id: string) => void;
    onarchive: (id: string) => void;
    onduplicate: (id: string) => void;
    ondelete: (id: string) => void;
    onexport: (id: string) => void;
  }

  const {
    id, name, startDate, endDate, castCount, updatedAt, archived,
    onopen, onarchive, onduplicate, ondelete, onexport,
  }: Props = $props();

  const dateRange = $derived(
    startDate && endDate ? formatUsDateRange(startDate, endDate) : "No dates set",
  );

  const relativeTime = $derived(formatRelative(updatedAt));

  function formatRelative(iso: string): string {
    const now = Date.now();
    const then = new Date(iso).getTime();
    const diffMs = now - then;
    const diffMin = Math.floor(diffMs / 60_000);
    if (diffMin < 1) return "Just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDay = Math.floor(diffHr / 24);
    if (diffDay < 30) return `${diffDay}d ago`;
    const diffMo = Math.floor(diffDay / 30);
    return `${diffMo}mo ago`;
  }

  let menuOpen = $state(false);
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="show-card"
  class:archived
  onclick={() => {
    if (!menuOpen) onopen(id);
  }}
>
  {#if archived}
    <span class="archived-badge">Archived</span>
  {/if}

  <h3 class="card-title">{name || "Untitled Show"}</h3>
  <p class="card-dates">{dateRange}</p>

  <div class="card-meta">
    <span class="meta-item">
      <svg width="14" height="14" viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true">
        <path d="M480-480q-66 0-113-47t-47-113q0-66 47-113t113-47q66 0 113 47t47 113q0 66-47 113t-113 47ZM160-160v-112q0-34 17.5-62.5T224-378q62-31 126-46.5T480-440q66 0 130 15.5T736-378q29 15 46.5 43.5T800-272v112H160Z"/>
      </svg>
      {castCount} cast
    </span>
    <span class="meta-item meta-time">{relativeTime}</span>
  </div>

  <div class="card-actions">
    <button
      type="button"
      class="action-btn"
      title="More actions"
      onclick={(e) => { e.stopPropagation(); menuOpen = !menuOpen; }}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <circle cx="12" cy="5" r="2"/>
        <circle cx="12" cy="12" r="2"/>
        <circle cx="12" cy="19" r="2"/>
      </svg>
    </button>

    {#if menuOpen}
      <div class="action-menu">
        <button type="button" class="menu-item" onclick={(e) => { e.stopPropagation(); menuOpen = false; onopen(id); }}>
          Open
        </button>
        <button type="button" class="menu-item" onclick={(e) => { e.stopPropagation(); menuOpen = false; onduplicate(id); }}>
          Duplicate
        </button>
        <button type="button" class="menu-item" onclick={(e) => { e.stopPropagation(); menuOpen = false; onexport(id); }}>
          Export as JSON
        </button>
        <div class="menu-divider"></div>
        <button type="button" class="menu-item" onclick={(e) => { e.stopPropagation(); menuOpen = false; onarchive(id); }}>
          {archived ? "Unarchive" : "Archive"}
        </button>
        <button type="button" class="menu-item menu-item-danger" onclick={(e) => { e.stopPropagation(); menuOpen = false; ondelete(id); }}>
          Delete
        </button>
      </div>
    {/if}
  </div>
</div>

<style>
  .show-card {
    position: relative;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    padding: var(--space-4) var(--space-5);
    cursor: pointer;
    transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    min-height: 140px;
  }
  .show-card:hover {
    border-color: var(--color-teal);
    box-shadow: var(--shadow-md);
  }
  .show-card.archived {
    opacity: 0.6;
    border-style: dashed;
  }
  .show-card.archived:hover {
    opacity: 0.85;
  }

  .archived-badge {
    position: absolute;
    top: var(--space-3);
    right: var(--space-3);
    font-size: 0.6875rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--color-text-muted);
    background: var(--color-bg-alt);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-full);
    padding: 2px 8px;
  }

  .card-title {
    font-family: var(--font-display);
    font-size: 1.125rem;
    font-weight: 700;
    color: var(--color-plum);
    margin: 0;
    line-height: 1.3;
    padding-right: var(--space-6);
  }

  .card-dates {
    font-size: 0.8125rem;
    color: var(--color-teal-dark);
    margin: 0;
    font-weight: 500;
  }

  .card-meta {
    display: flex;
    align-items: center;
    gap: var(--space-4);
    margin-top: auto;
    padding-top: var(--space-2);
  }

  .meta-item {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    font-size: 0.75rem;
    color: var(--color-text-muted);
  }

  .meta-time {
    margin-left: auto;
  }

  .card-actions {
    position: absolute;
    bottom: var(--space-3);
    right: var(--space-3);
  }

  .action-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border: none;
    background: transparent;
    color: var(--color-text-subtle);
    border-radius: var(--radius-sm);
    cursor: pointer;
    opacity: 0;
    transition: opacity var(--transition-fast), background var(--transition-fast);
  }
  .show-card:hover .action-btn {
    opacity: 1;
  }
  .action-btn:hover {
    background: var(--color-bg-alt);
    color: var(--color-text);
  }

  .action-menu {
    position: absolute;
    bottom: calc(100% + 4px);
    right: 0;
    min-width: 160px;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-lg);
    padding: var(--space-1) 0;
    z-index: 10;
  }

  .menu-item {
    display: block;
    width: 100%;
    padding: var(--space-2) var(--space-3);
    background: none;
    border: none;
    text-align: left;
    font: inherit;
    font-size: 0.8125rem;
    color: var(--color-text);
    cursor: pointer;
  }
  .menu-item:hover {
    background: var(--color-bg-alt);
  }
  .menu-item-danger {
    color: var(--color-danger);
  }
  .menu-item-danger:hover {
    background: var(--color-danger-bg);
  }

  .menu-divider {
    height: 1px;
    background: var(--color-border);
    margin: var(--space-1) 0;
  }
</style>
