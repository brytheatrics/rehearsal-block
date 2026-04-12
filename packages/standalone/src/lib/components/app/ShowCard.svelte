<script lang="ts">
  import { formatUsDateRange } from "@rehearsal-block/core";

  interface Props {
    id: string;
    name: string;
    startDate: string;
    endDate: string;
    castCount: number;
    updatedAt: string;
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
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="show-card"
  class:archived
  onclick={() => onopen(id)}
>
  <button
    type="button"
    class="archive-btn"
    title={archived ? "Unarchive" : "Archive"}
    onclick={(e) => { e.stopPropagation(); onarchive(id); }}
  >
    <svg width="18" height="18" viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true">
      <path d="M180-120q-24.75 0-42.37-17.63Q120-155.25 120-180v-529q0-9.88 3-19.06 3-9.18 9-16.94l57-75q8-11 20.94-17.5Q222.88-844 237-844h486q14.12 0 27.06 6.5T771-820l57 75q6 7.76 9 16.94 3 9.18 3 19.06v529q0 24.75-17.62 42.37Q804.75-120 780-120H180Zm17-614h566l-42.17-50H239l-42 50Zm-17 554h600v-494H180v494Zm300-98 156-156-42-42-84 84v-202h-60v202l-84-84-42 42 156 156Zm-300 98v-494 494Z"/>
    </svg>
  </button>

  {#if archived}
    <span class="archived-badge">Archived</span>
  {/if}

  <div class="card-top">
    <h3 class="card-title">{name || "Untitled Show"}</h3>
    <div class="card-dates">
      <span class="date-range">{dateRange}</span>
    </div>
    <div class="card-meta">
      <span class="meta-item">
        <svg width="14" height="14" viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true">
          <path d="M480-480q-66 0-113-47t-47-113q0-66 47-113t113-47q66 0 113 47t47 113q0 66-47 113t-113 47ZM160-160v-112q0-34 17.5-62.5T224-378q62-31 126-46.5T480-440q66 0 130 15.5T736-378q29 15 46.5 43.5T800-272v112H160Z"/>
        </svg>
        {castCount} cast
      </span>
    </div>
  </div>

  <div class="card-bottom">
    <span class="last-modified">Modified {relativeTime}</span>
    <div class="card-actions">
    <button
      type="button"
      class="action-btn"
      title="Edit"
      onclick={(e) => { e.stopPropagation(); onopen(id); }}
    >
      <svg width="18" height="18" viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true">
        <path d="M200-200h57l391-391-57-57-391 391v57Zm-80 80v-170l528-527q12-11 26.5-17t30.5-6q16 0 31 6t26 18l55 56q12 11 17.5 26t5.5 30q0 16-5.5 30.5T817-647L290-120H120Zm640-584-56-56 56 56Zm-141 85-28-29 57 57-29-28Z"/>
      </svg>
    </button>
    <button
      type="button"
      class="action-btn"
      title="Duplicate"
      onclick={(e) => { e.stopPropagation(); onduplicate(id); }}
    >
      <svg width="18" height="18" viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true">
        <path d="M760-200H320q-33 0-56.5-23.5T240-280v-560q0-33 23.5-56.5T320-920h280l240 240v400q0 33-23.5 56.5T760-200ZM560-640v-200H320v560h440v-360H560ZM160-40q-33 0-56.5-23.5T80-120v-560h80v560h440v80H160Zm160-800v200-200 560-560Z"/>
      </svg>
    </button>
    <button
      type="button"
      class="action-btn action-btn-danger"
      title="Delete"
      onclick={(e) => { e.stopPropagation(); ondelete(id); }}
    >
      <svg width="18" height="18" viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true">
        <path d="M280-120q-33 0-56.5-23.5T200-200v-520h-40v-80h200v-40h240v40h200v80h-40v520q0 33-23.5 56.5T680-120H280Zm400-600H280v520h400v-520ZM360-280h80v-360h-80v360Zm160 0h80v-360h-80v360ZM280-720v520-520Z"/>
      </svg>
    </button>
    </div>
  </div>
</div>

<style>
  .show-card {
    position: relative;
    background: linear-gradient(
      180deg,
      var(--color-plum) 0%,
      var(--color-plum-light) 50%,
      #6b5482 100%
    );
    border: 1px solid var(--color-plum-light);
    border-radius: var(--radius-lg);
    padding: var(--space-5);
    cursor: pointer;
    transition: transform var(--transition-fast), box-shadow var(--transition-fast);
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    min-height: 160px;
    overflow: hidden;
  }
  .show-card:hover {
    transform: translateY(-2px);
    box-shadow: var(--shadow-lg);
  }
  .show-card.archived {
    opacity: 0.55;
    background: linear-gradient(
      180deg,
      #4a3d5c 0%,
      #5a4d6c 50%,
      #6b5f7a 100%
    );
    border-style: dashed;
  }
  .show-card.archived:hover {
    opacity: 0.8;
  }

  .archive-btn {
    position: absolute;
    top: var(--space-3);
    right: var(--space-3);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border: none;
    background: transparent;
    color: rgba(255, 255, 255, 0.7);
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: all var(--transition-fast);
  }
  .archive-btn:hover {
    color: #ffffff;
    background: rgba(255, 255, 255, 0.15);
  }

  .archived-badge {
    position: absolute;
    top: var(--space-3);
    right: calc(var(--space-3) + 36px);
    font-size: 0.6875rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: rgba(255, 255, 255, 0.8);
    background: rgba(0, 0, 0, 0.2);
    border-radius: var(--radius-full);
    padding: 2px 10px;
  }

  .card-top {
    flex: 1;
  }

  .card-title {
    font-family: var(--font-display);
    font-size: 1.25rem;
    font-weight: 700;
    color: #ffffff;
    margin: 0 0 var(--space-2) 0;
    line-height: 1.3;
    padding-right: var(--space-6);
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.15);
  }

  .card-dates {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex-wrap: wrap;
    margin-bottom: var(--space-2);
  }

  .date-range {
    font-size: 0.8125rem;
    color: rgba(255, 255, 255, 0.9);
    font-weight: 600;
  }

  .card-meta {
    margin-top: var(--space-1);
  }

  .meta-item {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    font-size: 0.75rem;
    color: rgba(255, 255, 255, 0.85);
  }

  .card-bottom {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .last-modified {
    font-size: 0.75rem;
    color: rgba(255, 255, 255, 0.85);
  }

  .card-actions {
    display: flex;
    gap: var(--space-2);
  }

  .action-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 34px;
    height: 34px;
    border: none;
    background: transparent;
    color: #ffffff;
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: all var(--transition-fast);
  }
  .action-btn:hover {
    color: #ffffff;
    background: rgba(255, 255, 255, 0.15);
  }

  .action-btn-danger:hover {
    color: #ff8a8a;
    background: rgba(220, 38, 38, 0.2);
  }
</style>
