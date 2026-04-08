<script lang="ts">
  /**
   * Group chip. Rendered in the sidebar (full-size) and in grid cells
   * (compact). A group chip is visually distinct from cast chips -
   * different shape + deterministic color derived from the group id -
   * so directors can tell at a glance whether a day is calling an
   * individual actor or a whole group.
   *
   * When a day calls a group, the grid shows ONE group chip for the
   * whole group instead of expanding to individual cast chips. This
   * matches how directors think about their schedule ("Act 1 cast",
   * "Ensemble", "Dancers") and keeps the cell compact.
   */
  import type { Group } from "@rehearsal-block/core";
  import { locationColor } from "@rehearsal-block/core";

  interface Props {
    group: Group;
    compact?: boolean;
    /**
     * When provided, renders an × button. Clicking runs the handler
     * after stopping propagation so the parent cell's click doesn't
     * fire. Used in grid cells to uncall a group without opening the
     * editor.
     */
    onremove?: () => void;
  }

  const { group, compact = false, onremove }: Props = $props();

  // Use the explicit color if set; otherwise derive a stable color
  // from the group id via the location-color hash function.
  const color = $derived(group.color ?? locationColor(group.id) ?? "#6a1b9a");

  function handleRemove(e: MouseEvent | KeyboardEvent) {
    e.stopPropagation();
    if (e instanceof KeyboardEvent && e.key !== "Enter" && e.key !== " ") {
      return;
    }
    if (e instanceof KeyboardEvent) e.preventDefault();
    onremove?.();
  }
</script>

<span
  class="group-chip"
  class:compact
  class:removable={!!onremove}
  style:--group-color={color}
  title={`${group.name} (${group.memberIds.length} ${group.memberIds.length === 1 ? "member" : "members"})`}
>
  <span class="group-icon" aria-hidden="true">★</span>
  <span class="group-name">{group.name}</span>
  {#if onremove}
    <button
      type="button"
      class="group-remove"
      aria-label={`Uncall ${group.name}`}
      title={`Uncall ${group.name}`}
      onclick={handleRemove}
      onkeydown={handleRemove}
    >
      ×
    </button>
  {/if}
</span>

<style>
  .group-chip {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    padding: var(--space-1) var(--space-2);
    background: var(--group-color);
    color: var(--color-text-inverse);
    border: 1px solid var(--group-color);
    border-radius: var(--radius-sm);
    font-size: 0.75rem;
    font-weight: 700;
    line-height: 1.2;
    white-space: nowrap;
  }

  .group-chip.compact {
    padding: 1px var(--space-1);
    font-size: var(--size-group-badge, 0.625rem);
  }

  .group-icon {
    font-size: 0.6875rem;
    flex-shrink: 0;
  }

  .compact .group-icon {
    font-size: 0.5625rem;
  }

  .group-name {
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 180px;
  }

  .group-remove {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 12px;
    height: 12px;
    padding: 0;
    margin-left: 2px;
    border: none;
    background: transparent;
    color: var(--color-text-inverse);
    font-size: 0.875rem;
    line-height: 1;
    cursor: pointer;
    border-radius: var(--radius-full);
    opacity: 0;
    transition:
      opacity var(--transition-fast),
      background var(--transition-fast);
    flex-shrink: 0;
  }
  .group-chip.removable:hover .group-remove,
  .group-remove:focus-visible {
    opacity: 1;
  }
  .group-remove:hover {
    background: rgba(0, 0, 0, 0.25);
  }
  .compact .group-remove {
    width: 10px;
    height: 10px;
    font-size: 0.75rem;
  }
</style>
