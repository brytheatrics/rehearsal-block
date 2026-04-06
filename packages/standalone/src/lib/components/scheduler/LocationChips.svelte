<script lang="ts">
  /**
   * Chip-based location picker. Replaces the previous text input + datalist
   * approach so the director's saved locations are always visible and the
   * auto-assigned color for each location matches the day-cell display.
   *
   * Usage:
   * - Click an unselected chip to select it (sets value to that preset).
   * - Click the selected chip to clear the value.
   * - Use the "+ Add" affordance to append a brand-new location; the
   *   parent receives `onaddpreset` so it can persist the new name in
   *   `locationPresets` for future use.
   *
   * An empty `value` with a non-empty `fallback` displays the fallback
   * text in muted italic so per-call pickers visibly inherit the
   * day-level default when nothing is selected.
   */
  import { locationColor } from "@rehearsal-block/core";

  interface Props {
    value: string;
    presets: string[];
    /** Day-level default surfaced as a "(uses default: X)" hint when value is empty. */
    fallback?: string;
    onchange: (next: string) => void;
    /** Called when the user types a brand-new location that isn't in presets. */
    onaddpreset: (name: string) => void;
  }

  const {
    value,
    presets,
    fallback = "",
    onchange,
    onaddpreset,
  }: Props = $props();

  let adding = $state(false);
  let newName = $state("");
  let inputEl = $state<HTMLInputElement | null>(null);

  function toggle(preset: string) {
    onchange(value === preset ? "" : preset);
  }

  function startAdd() {
    adding = true;
    newName = "";
    // Focus the input after it mounts.
    queueMicrotask(() => inputEl?.focus());
  }

  function cancelAdd() {
    adding = false;
    newName = "";
  }

  function commitAdd() {
    const trimmed = newName.trim();
    if (!trimmed) {
      cancelAdd();
      return;
    }
    // If it already exists (case-insensitive), just select it.
    const existing = presets.find(
      (p) => p.toLowerCase() === trimmed.toLowerCase(),
    );
    if (existing) {
      onchange(existing);
    } else {
      onaddpreset(trimmed);
      onchange(trimmed);
    }
    adding = false;
    newName = "";
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      commitAdd();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancelAdd();
    }
  }
</script>

<div class="chips">
  {#each presets as preset (preset)}
    {@const color = locationColor(preset) ?? "var(--color-text-muted)"}
    {@const selected = value === preset}
    <button
      type="button"
      class="loc-chip"
      class:selected
      style:--chip-color={color}
      onclick={() => toggle(preset)}
    >
      <span class="swatch" aria-hidden="true"></span>
      <span class="name">{preset}</span>
    </button>
  {/each}

  {#if adding}
    <div class="add-input">
      <input
        bind:this={inputEl}
        type="text"
        value={newName}
        placeholder="New location"
        oninput={(e) => (newName = e.currentTarget.value)}
        onkeydown={onKey}
        onblur={commitAdd}
      />
    </div>
  {:else}
    <button type="button" class="loc-chip add-chip" onclick={startAdd}>
      + Add
    </button>
  {/if}
</div>

{#if !value && fallback}
  <div class="inherit-hint">uses day default: <em>{fallback}</em></div>
{/if}

<style>
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }

  .loc-chip {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-1) var(--space-3);
    background: var(--color-surface);
    border: 1px solid var(--color-border-strong);
    border-radius: var(--radius-full);
    font: inherit;
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--color-text-muted);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .loc-chip:hover {
    border-color: var(--chip-color);
    color: var(--chip-color);
  }

  .loc-chip.selected {
    background: var(--chip-color);
    border-color: var(--chip-color);
    color: var(--color-text-inverse);
  }

  .loc-chip.selected .swatch {
    background: var(--color-text-inverse);
  }

  .swatch {
    width: 8px;
    height: 8px;
    border-radius: var(--radius-full);
    background: var(--chip-color);
  }

  .add-chip {
    border-style: dashed;
    color: var(--color-text-subtle);
  }

  .add-chip:hover {
    border-color: var(--color-plum);
    color: var(--color-plum);
    background: var(--color-bg-alt);
  }

  .add-input {
    display: inline-flex;
    align-items: center;
  }

  .add-input input {
    font: inherit;
    font-size: 0.75rem;
    padding: var(--space-1) var(--space-3);
    border: 1px solid var(--color-plum);
    border-radius: var(--radius-full);
    background: var(--color-surface);
    min-width: 140px;
  }

  .add-input input:focus {
    outline: 2px solid var(--color-teal);
    outline-offset: 0;
  }

  .inherit-hint {
    font-size: 0.6875rem;
    color: var(--color-text-subtle);
    font-style: italic;
    margin-top: var(--space-1);
  }

  .inherit-hint em {
    font-style: normal;
    color: var(--color-text-muted);
  }
</style>
