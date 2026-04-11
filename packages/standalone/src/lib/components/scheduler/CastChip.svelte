<script lang="ts">
  /**
   * One cast member rendered as a chip - used both in the sidebar and
   * (compact variant) inside day cells to show who's called. Pure
   * presentation; no drag logic yet (Phase 3).
   */
  import type { CastDisplayMode, CastMember } from "@rehearsal-block/core";
  import { fadeWhenClipped } from "$lib/fade-when-clipped";

  interface Props {
    member: CastMember;
    /** Compact variant used inside day cells (smaller, no character line). */
    compact?: boolean;
    /**
     * Disambiguated display label, pre-computed by the caller via
     * `castDisplayNames(cast, mode)` from `@rehearsal-block/core`. In
     * "both" mode this label is already "First / Character", so the
     * chip doesn't need to concatenate anything itself.
     */
    displayName?: string;
    /**
     * Current cast display mode. Drives whether the sidebar (non-compact)
     * chip renders the character name on a second line: only in "both"
     * mode, since "actor" and "character" put everything in `displayName`
     * already.
     */
    mode?: CastDisplayMode;
    /**
     * If provided, a small × button is rendered on the chip. Clicking
     * it runs the handler without triggering the parent cell's click
     * (propagation is stopped). Used by grid cells so directors can
     * uncall an actor straight from the day cell without opening the
     * editor.
     */
    onremove?: () => void;
    /**
     * Makes the chip an HTML5 drag source. The cell uses this so an
     * actor chip can be dragged between calls on the same day (the
     * dragstart handler sets a `text/rb-move-actor` payload).
     */
    draggable?: boolean;
    ondragstart?: (e: DragEvent) => void;
  }

  const {
    member,
    compact = false,
    displayName,
    mode = "actor",
    onremove,
    draggable = false,
    ondragstart,
  }: Props = $props();
  const label = $derived(displayName ?? member.firstName);
  const showCharacterLine = $derived(!compact && mode === "both");

  function handleRemove(e: MouseEvent | KeyboardEvent) {
    e.stopPropagation();
    if (e instanceof KeyboardEvent && e.key !== "Enter" && e.key !== " ") {
      return;
    }
    if (e instanceof KeyboardEvent) e.preventDefault();
    onremove?.();
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<span
  class="chip"
  class:compact
  class:removable={!!onremove}
  class:grabbable={draggable}
  style:--chip-color={member.color}
  title={`${member.firstName} ${member.lastName} - ${member.character}`}
  draggable={draggable ? "true" : undefined}
  ondragstart={ondragstart}
>
  <span class="chip-dot" aria-hidden="true"></span>
  <span class="chip-name">{label}</span>
  {#if showCharacterLine}
    <span class="chip-character" use:fadeWhenClipped>{member.character}</span>
  {/if}
  {#if onremove}
    <button
      type="button"
      class="chip-remove"
      aria-label={`Uncall ${label}`}
      title={`Uncall ${label}`}
      onclick={handleRemove}
      onkeydown={handleRemove}
    >
      ×
    </button>
  {/if}
</span>

<style>
  .chip {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-left: 3px solid var(--chip-color);
    border-radius: var(--radius-sm);
    font-size: 0.8125rem;
    line-height: 1.2;
    max-width: 100%;
  }

  /* "Both" mode (chip has both name + character on the row): the
     character text often overflows the sidebar's narrow width. Instead
     of clipping with "...", force the chip to fill its row, hide the
     overflow, and lay a gradient overlay across the rightmost ~24px
     so the text fades into the chip's background while the border,
     border-radius, and colored left stripe stay fully intact. */
  .chip:has(.chip-character) {
    display: flex;
    width: 100%;
    overflow: hidden;
    position: relative;
  }
  /* Fade overlay only renders when the chip is actually overflowing.
     The .is-overflowing class is toggled by the fadeWhenClipped action
     on .chip-character via a ResizeObserver - when the character text
     fits naturally, no class is set and no fade artifacts appear on
     the chip's right edge. The :global() wrapper on the dynamic class
     lets Svelte's static analysis see the rule as used. */
  .chip:has(.chip-character):global(.is-overflowing)::after {
    content: "";
    position: absolute;
    top: 0;
    bottom: 0;
    right: 0;
    /* 22px fade zone running right up to the chip border with no
       solid buffer. The full overlay is the smooth gradient. */
    width: 22px;
    background: linear-gradient(
      to right,
      transparent,
      var(--color-surface)
    );
    pointer-events: none;
  }

  .chip.grabbable {
    cursor: grab;
  }
  .chip.grabbable:active {
    cursor: grabbing;
  }

  .chip.compact {
    padding: 2px var(--space-1) 2px var(--space-2);
    gap: var(--space-1);
    font-size: var(--size-cast-badge, 0.6875rem);
    border-left-width: 2px;
  }

  .chip-dot {
    width: 6px;
    height: 6px;
    border-radius: var(--radius-full);
    background: var(--chip-color);
    flex-shrink: 0;
  }

  .compact .chip-dot {
    width: 4px;
    height: 4px;
  }

  .chip-name {
    font-weight: 600;
    color: var(--color-text);
    white-space: nowrap;
  }

  .chip-character {
    color: var(--color-text-muted);
    font-size: 0.6875rem;
    margin-left: auto;
    white-space: nowrap;
    /* Ellipsis + fade combo: when the row is too narrow, the character
       text shrinks (min-width: 0 lets it go below content size) and
       text-overflow shows "..." within its own box. The chip's ::after
       overlay then sits on top of that ellipsis, fading the right edge
       smoothly. The combination reads as a soft fade with a tiny dot
       trail at the end. */
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .chip-remove {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 12px;
    height: 12px;
    padding: 0;
    margin-left: 2px;
    border: none;
    background: transparent;
    color: var(--chip-color);
    font-size: 0.875rem;
    line-height: 1;
    cursor: pointer;
    border-radius: var(--radius-full);
    opacity: 0;
    transition: opacity var(--transition-fast), background var(--transition-fast);
    flex-shrink: 0;
  }
  .chip.removable:hover .chip-remove,
  .chip-remove:focus-visible {
    opacity: 1;
  }
  .chip-remove:hover {
    background: var(--color-danger);
    color: var(--color-text-inverse);
  }
  .compact .chip-remove {
    width: 10px;
    height: 10px;
    font-size: 0.75rem;
  }
</style>
