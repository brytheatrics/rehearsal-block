<script lang="ts">
  /**
   * Right-side tool palette. Mirrors the left Sidebar's collapse +
   * sticky behavior, but contains draggable pill chips for day-level
   * content (event type, location, call, description, note). Drag a
   * chip onto a day cell to populate that field without opening the
   * full day editor. Multi-day drops respected by the demo handlers.
   *
   * dataTransfer payload formats:
   *   "text/rb-event-type"  -> event type id
   *   "text/rb-location"    -> location name
   *   "text/rb-call"        -> literal "1"
   *   "text/rb-note"        -> literal "1"
   *
   * The Call chip already opens a per-call description editor on drop,
   * so a separate Description chip would be redundant. The day-level
   * description field is still editable through the day editor.
   */
  import type { ScheduleDoc, EventType, LocationPreset } from "@rehearsal-block/core";
  import { effectiveLocationColor, effectiveLocationShape } from "@rehearsal-block/core";

  interface Props {
    show: ScheduleDoc;
    collapsed?: boolean;
    oncollapsetoggle?: () => void;
    /** Create a new event type with the given name. The demo page
     *  supplies defaults for color / text color / isDressPerf. */
    onaddeventtype?: (name: string) => void;
    /** Create a new location preset with the given name. */
    onaddlocation?: (name: string) => void;
  }

  const {
    show,
    collapsed = false,
    oncollapsetoggle,
    onaddeventtype,
    onaddlocation,
  }: Props = $props();

  // Only surface V2 entries whose name is still in the canonical
  // locationPresets list - stale V2 records from older removals would
  // otherwise appear as ghost chips in the picker.
  const locations = $derived.by<LocationPreset[]>(() => {
    const names = new Set(show.locationPresets.map((n) => n.toLowerCase()));
    const v2 = show.locationPresetsV2?.filter((p) => names.has(p.name.toLowerCase())) ?? [];
    if (v2.length > 0) return v2;
    return show.locationPresets.map((name) => ({ name }));
  });

  // Inline add state: when the user clicks the + button on a section
  // header, swap in a small input for entering the new item's name.
  // Enter creates it via the callback; Escape / blur cancels.
  let addingEventType = $state(false);
  let addingLocation = $state(false);
  let newEventTypeName = $state("");
  let newLocationName = $state("");
  let etInputEl = $state<HTMLInputElement | null>(null);
  let locInputEl = $state<HTMLInputElement | null>(null);

  function startAddEventType() {
    addingEventType = true;
    newEventTypeName = "";
    requestAnimationFrame(() => queueMicrotask(() => etInputEl?.focus()));
  }
  function cancelAddEventType() {
    addingEventType = false;
    newEventTypeName = "";
  }
  function commitAddEventType() {
    const name = newEventTypeName.trim();
    if (name && onaddeventtype) onaddeventtype(name);
    cancelAddEventType();
  }

  function startAddLocation() {
    addingLocation = true;
    newLocationName = "";
    requestAnimationFrame(() => queueMicrotask(() => locInputEl?.focus()));
  }
  function cancelAddLocation() {
    addingLocation = false;
    newLocationName = "";
  }
  function commitAddLocation() {
    const name = newLocationName.trim();
    if (name && onaddlocation) onaddlocation(name);
    cancelAddLocation();
  }

  function dragEventType(e: DragEvent, et: EventType) {
    if (!e.dataTransfer) return;
    e.dataTransfer.setData("text/rb-event-type", et.id);
    e.dataTransfer.setData("text/plain", et.name);
    e.dataTransfer.effectAllowed = "copy";
  }

  function dragLocation(e: DragEvent, loc: LocationPreset) {
    if (!e.dataTransfer) return;
    e.dataTransfer.setData("text/rb-location", loc.name);
    e.dataTransfer.setData("text/plain", loc.name);
    e.dataTransfer.effectAllowed = "copy";
  }

  function dragCall(e: DragEvent) {
    if (!e.dataTransfer) return;
    e.dataTransfer.setData("text/rb-call", "1");
    e.dataTransfer.setData("text/plain", "Call");
    e.dataTransfer.effectAllowed = "copy";
  }

  function dragNote(e: DragEvent) {
    if (!e.dataTransfer) return;
    e.dataTransfer.setData("text/rb-note", "1");
    e.dataTransfer.setData("text/plain", "Note");
    e.dataTransfer.effectAllowed = "copy";
  }
</script>

<aside class="tool-sidebar" class:collapsed>
  {#if collapsed}
    {#if oncollapsetoggle}
      <button
        type="button"
        class="sidebar-collapse-toggle collapsed-state"
        title="Show day tools"
        aria-label="Show day tools"
        aria-expanded="false"
        onclick={oncollapsetoggle}
      >
        <!-- arrow_circle_left (mirrors the left sidebar's collapsed-state icon) -->
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 -960 960 960"
          width="22"
          height="22"
          fill="currentColor"
          style="transform: rotate(180deg);"
          aria-hidden="true"
        >
          <path d="M507-480 384-357l56 57 180-180-180-180-56 57 123 123ZM480-80q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Zm0-80q134 0 227-93t93-227q0-134-93-227t-227-93q-134 0-227 93t-93 227q0 134 93 227t227 93Zm0-320Z"/>
        </svg>
      </button>
    {/if}
  {:else}
    <div class="sidebar-header">
      <div class="header-row">
        {#if oncollapsetoggle}
          <button
            type="button"
            class="sidebar-collapse-toggle expanded-state"
            title="Hide day tools"
            aria-label="Hide day tools"
            aria-expanded="true"
            onclick={oncollapsetoggle}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 -960 960 960"
              width="22"
              height="22"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M507-480 384-357l56 57 180-180-180-180-56 57 123 123ZM480-80q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Zm0-80q134 0 227-93t93-227q0-134-93-227t-227-93q-134 0-227 93t-93 227q0 134 93 227t227 93Zm0-320Z"/>
            </svg>
          </button>
        {/if}
        <span class="header-title">Day Tools</span>
      </div>
      <p class="drag-hint">Drag onto a day to add</p>
    </div>

    <div class="sidebar-scroll">
      <section class="tool-section">
        <div class="section-head">
          {#if onaddeventtype}
            <button
              type="button"
              class="section-add"
              aria-label="Add event type"
              title="Add event type"
              onclick={startAddEventType}
            >
              +
            </button>
          {/if}
          <h4 class="section-title">Event Type</h4>
        </div>
        {#if addingEventType}
          <!-- svelte-ignore a11y_autofocus -->
          <input
            type="text"
            class="section-add-input"
            placeholder="New event type"
            bind:value={newEventTypeName}
            bind:this={etInputEl}
            onkeydown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); commitAddEventType(); }
              else if (e.key === "Escape") { e.preventDefault(); cancelAddEventType(); }
              e.stopPropagation();
            }}
            onblur={commitAddEventType}
          />
        {/if}
        {#if show.eventTypes.length > 0}
          <div class="pill-wrap">
            {#each show.eventTypes as et (et.id)}
              <div
                class="tool-pill"
                role="button"
                tabindex="0"
                draggable="true"
                ondragstart={(e) => dragEventType(e, et)}
                style="background: {et.bgColor}; color: {et.textColor};"
                title="Drag to set event type"
              >
                {et.name}
              </div>
            {/each}
          </div>
        {/if}
      </section>

      <section class="tool-section">
        <div class="section-head">
          {#if onaddlocation}
            <button
              type="button"
              class="section-add"
              aria-label="Add location"
              title="Add location"
              onclick={startAddLocation}
            >
              +
            </button>
          {/if}
          <h4 class="section-title">Location</h4>
        </div>
        {#if addingLocation}
          <input
            type="text"
            class="section-add-input"
            placeholder="New location"
            bind:value={newLocationName}
            bind:this={locInputEl}
            onkeydown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); commitAddLocation(); }
              else if (e.key === "Escape") { e.preventDefault(); cancelAddLocation(); }
              e.stopPropagation();
            }}
            onblur={commitAddLocation}
          />
        {/if}
        {#if locations.length > 0}
          <div class="pill-wrap">
            {#each locations as loc (loc.name)}
              {@const color = effectiveLocationColor(loc.name, show.locationPresetsV2) ?? "#6a1b9a"}
              {@const shape = effectiveLocationShape(loc.name, show.locationPresetsV2)}
              <div
                class="tool-pill location-pill"
                role="button"
                tabindex="0"
                draggable="true"
                ondragstart={(e) => dragLocation(e, loc)}
                style="border-color: {color}; color: {color};"
                title="Drag to set location"
              >
                <span class="loc-shape" aria-hidden="true">{shape}</span>
                {loc.name}
              </div>
            {/each}
          </div>
        {/if}
      </section>

      <section class="tool-section add-section">
        <h4 class="section-title">Add</h4>
        <div
          class="tool-pill call-pill"
          role="button"
          tabindex="0"
          draggable="true"
          ondragstart={dragCall}
          title="Drag to add a blank call"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" width="14" height="14" fill="currentColor" aria-hidden="true">
            <path d="m612-292 56-56-148-148v-184h-80v216l172 172ZM480-80q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Zm0-400Zm0 320q133 0 226.5-93.5T800-480q0-133-93.5-226.5T480-800q-133 0-226.5 93.5T160-480q0 133 93.5 226.5T480-160Z"/>
          </svg>
          Call
        </div>
        <div
          class="tool-pill note-pill"
          role="button"
          tabindex="0"
          draggable="true"
          ondragstart={dragNote}
          title="Drag to add a note"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" width="14" height="14" fill="currentColor" aria-hidden="true">
            <path d="m160-120 22-65q8-25 29-40t47-15h444q26 0 47 15t29 40l22 65H160Zm80-200 200-520h80l200 520H240Zm116-80h248L480-721 356-400Zm0 0h248-248Z"/>
          </svg>
          Note
        </div>
      </section>
    </div>
  {/if}
</aside>

<style>
  .tool-sidebar {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    min-width: 0;
  }

  .tool-sidebar.collapsed {
    align-items: center;
  }

  .sidebar-header {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    position: sticky;
    top: 0;
    z-index: 5;
    background: var(--color-bg);
    padding-bottom: var(--space-2);
  }

  .header-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .header-title {
    /* Push the Day Tools pill to the right edge of the header row,
     * leaving the collapse button on the left. Contents below stay
     * left-aligned. */
    margin-left: auto;
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--color-teal);
    border-radius: var(--radius-full);
    background: var(--color-teal);
    color: var(--color-text-inverse);
    font-size: 0.75rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .drag-hint {
    margin: 0;
    font-size: 0.6rem;
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    text-align: right;
  }

  .sidebar-scroll {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .tool-section {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    align-items: flex-end;
  }

  .section-head {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: var(--space-1);
  }

  .section-title {
    margin: 0;
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--color-text-muted);
    text-align: right;
  }

  .section-add {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    padding: 0;
    border: 1px solid var(--color-border);
    background: var(--color-bg);
    color: var(--color-text-muted);
    border-radius: var(--radius-full);
    font-size: 0.9rem;
    line-height: 1;
    cursor: pointer;
    transition: color var(--transition-fast), border-color var(--transition-fast), background var(--transition-fast);
  }
  .section-add:hover {
    color: var(--color-teal);
    border-color: var(--color-teal);
    background: var(--color-bg-alt);
  }

  .section-add-input {
    align-self: stretch;
    padding: 4px 8px;
    border: 1px solid var(--color-teal);
    border-radius: var(--radius-sm);
    font-size: 0.78rem;
    font-family: inherit;
    color: var(--color-text);
    background: var(--color-bg);
    text-align: right;
    outline: none;
  }
  .section-add-input:focus {
    box-shadow: 0 0 0 2px rgba(56, 129, 125, 0.15);
  }

  .pill-wrap {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: var(--space-2);
  }

  .tool-pill {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 5px 10px;
    border-radius: var(--radius-sm);
    font-size: 0.78rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    line-height: 1.3;
    cursor: grab;
    user-select: none;
    border: 1px solid transparent;
    transition: transform 80ms ease, box-shadow 120ms ease;
  }

  .tool-pill:hover {
    transform: translateY(-1px);
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08);
  }

  .tool-pill:active {
    cursor: grabbing;
    transform: translateY(0);
  }

  .location-pill {
    background: var(--color-bg);
    border-width: 1px;
    border-style: solid;
  }

  .loc-shape {
    font-size: 0.85em;
    line-height: 1;
    flex-shrink: 0;
  }

  /* The Add section stacks the Call / Note pills vertically so each
   * gets its own row, right-aligned to the sidebar edge. */
  .add-section {
    align-items: flex-end;
  }

  /* Call = warm amber (echoes the clock icon's "time" feel and
   * contrasts the cool teal Day Tools header). Note = neutral slate
   * (graphite / pencil semantics, subtle so it doesn't fight the
   * pastel event type pills above). */
  .call-pill {
    background: #1565c0;
    color: var(--color-text-inverse);
    border-color: #1565c0;
  }
  .call-pill:hover {
    background: #0d47a1;
    border-color: #0d47a1;
  }

  .note-pill {
    background: #6a1b9a;
    color: var(--color-text-inverse);
    border-color: #6a1b9a;
  }
  .note-pill:hover {
    background: #4a148c;
    border-color: #4a148c;
  }

  .sidebar-collapse-toggle {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    padding: 0;
    border: none;
    border-radius: var(--radius-full);
    background: transparent;
    color: var(--color-text-muted);
    cursor: pointer;
    flex-shrink: 0;
    transition:
      color var(--transition-fast),
      background var(--transition-fast);
  }
  .sidebar-collapse-toggle:hover {
    color: var(--color-plum);
    background: var(--color-bg-alt);
  }
  .sidebar-collapse-toggle.collapsed-state {
    color: var(--color-teal);
  }
  .sidebar-collapse-toggle.collapsed-state:hover {
    color: var(--color-teal-dark);
    background: var(--color-bg-alt);
  }

  /* Mobile: drop the teal highlight on the collapsed-state arrow.
     On phones the toolbar sticks at the very top of the screen and the
     teal arrows on its left/right look like page-navigation controls,
     not "expand the sidebar" controls. Use a faint subtle color so
     they recede into the background until tapped. */
  @media (max-width: 768px) {
    .sidebar-collapse-toggle.collapsed-state {
      color: var(--color-text-subtle);
      opacity: 0.55;
    }
    .sidebar-collapse-toggle.collapsed-state:hover {
      color: var(--color-text-muted);
      opacity: 1;
      background: transparent;
    }
  }
</style>
