<script lang="ts">
  /**
   * Cast sidebar. Lists every cast member as a chip, plus a curated
   * "All Called" special chip at the top and any groups the director
   * has defined. Chips are draggable onto day cells (the grid side
   * handles the drop event).
   *
   * The cast display mode toggle at the top lets the director switch
   * between actor name, character name, or both - stored on
   * `doc.settings.castDisplayMode` and applied consistently to every
   * chip location (sidebar, grid cells, editor checklist).
   *
   * Groups: inline CRUD. Click "+ Add group" to open a form with a
   * name input and a checkbox list of cast members. Click a group's ✎
   * button to edit, × to delete. Groups get an auto-assigned color
   * derived from the group id so the grid chip stays stable across
   * reloads.
   */
  import type {
    CastDisplayMode,
    CastMember,
    Group,
    ScheduleDoc,
  } from "@rehearsal-block/core";
  import { CAST_COLOR_PALETTE, castDisplayNames, locationColor } from "@rehearsal-block/core";
  import CastChip from "./CastChip.svelte";
  import GroupChip from "./GroupChip.svelte";

  interface Props {
    show: ScheduleDoc;
    /**
     * Optional - when provided, an edit pencil appears next to the Cast
     * heading. The demo wires this to its paywall; a future /app route
     * will wire it to a cast editor modal.
     */
    oneditcast?: () => void;
    /** Update the cast display mode (actor/character/both). */
    onsetcastdisplaymode: (mode: CastDisplayMode) => void;
    /** Create a new group. The parent assigns the final id. */
    onaddgroup: (group: Group) => void;
    /** If provided, the + Add group button triggers this instead of
     *  opening the inline form. Used by demo to show the paywall. */
    onaddgroupblocked?: () => void;
    /** Update an existing group (name and/or member list). */
    onupdategroup: (id: string, patch: Partial<Group>) => void;
    /** Remove a group entirely. Any calls that referenced it lose the group. */
    onremovegroup: (id: string) => void;
  }

  const {
    show,
    oneditcast,
    onsetcastdisplaymode,
    onaddgroup,
    onaddgroupblocked,
    onupdategroup,
    onremovegroup,
  }: Props = $props();

  const mode = $derived<CastDisplayMode>(show.settings.castDisplayMode ?? "actor");
  /** Grid chips use the mode-aware short names (first name, character, etc.). */
  const displayNames = $derived(castDisplayNames(show.cast, mode));
  /**
   * Sidebar chips in "actor" mode show full first + last name since
   * there's room. "character" and "both" modes use the same compact
   * labels as the grid.
   */
  const sidebarDisplayNames = $derived.by(() => {
    if (mode !== "actor") return displayNames;
    const out = new Map<string, string>();
    for (const m of show.cast) {
      out.set(m.id, `${m.firstName} ${m.lastName}`);
    }
    return out;
  });

  // Group color popover: which group's picker is open (null = none).
  let groupColorFor = $state<string | null>(null);
  let colorPopoverPos = $state<{ top: number; left: number }>({ top: 0, left: 0 });

  function openColorPopover(e: MouseEvent, id: string) {
    e.stopPropagation();
    if (groupColorFor === id) {
      groupColorFor = null;
      return;
    }
    const btn = e.currentTarget as HTMLElement;
    const rect = btn.getBoundingClientRect();
    colorPopoverPos = {
      top: rect.bottom + 4,
      left: rect.left,
    };
    groupColorFor = id;
  }

  // Group CRUD state. Only one group form can be open at a time.
  // null = no form, "new" = add form, or a group id for edit.
  let groupFormFor = $state<string | null>(null);
  let groupFormName = $state("");
  let groupFormMembers = $state<Set<string>>(new Set());
  let groupFormColor = $state<string | undefined>(undefined);
  let groupFormEl = $state<HTMLDivElement | null>(null);

  function scrollToForm() {
    queueMicrotask(() => {
      groupFormEl?.scrollIntoView({ block: "center", behavior: "auto" });
    });
  }

  function openAddGroup() {
    groupFormFor = "new";
    groupFormName = "";
    groupFormMembers = new Set();
    groupFormColor = undefined;
    groupColorFor = null;
    scrollToForm();
  }

  function openEditGroup(group: Group) {
    groupFormFor = group.id;
    groupFormName = group.name;
    groupFormMembers = new Set(group.memberIds);
    groupFormColor = group.color ?? locationColor(group.id) ?? undefined;
    groupColorFor = null;
    scrollToForm();
  }

  function cancelGroupForm() {
    groupFormFor = null;
    groupFormName = "";
    groupFormMembers = new Set();
    groupFormColor = undefined;
    groupColorFor = null;
  }

  function toggleGroupMember(id: string) {
    const next = new Set(groupFormMembers);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    groupFormMembers = next;
  }

  function commitGroupForm() {
    const name = groupFormName.trim();
    if (!name) return;
    const memberIds = Array.from(groupFormMembers);
    if (groupFormFor === "new") {
      const id = `g_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      onaddgroup({ id, name, memberIds, color: groupFormColor });
    } else if (groupFormFor) {
      onupdategroup(groupFormFor, { name, memberIds, color: groupFormColor });
    }
    cancelGroupForm();
  }

  function handleGroupFormKey(e: KeyboardEvent) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      commitGroupForm();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancelGroupForm();
    }
  }

  // HTML5 drag setup. dataTransfer payload formats:
  //   "text/rb-actor"     -> actor id
  //   "text/rb-group"     -> group id
  //   "text/rb-all-called" -> literal "1"
  // Day cells read these in their drop handlers.
  function dragActor(e: DragEvent, member: CastMember) {
    if (!e.dataTransfer) return;
    e.dataTransfer.setData("text/rb-actor", member.id);
    e.dataTransfer.setData("text/plain", member.firstName);
    e.dataTransfer.effectAllowed = "copy";
  }

  function dragGroup(e: DragEvent, group: Group) {
    if (!e.dataTransfer) return;
    e.dataTransfer.setData("text/rb-group", group.id);
    e.dataTransfer.setData("text/plain", group.name);
    e.dataTransfer.effectAllowed = "copy";
  }

  function dragAllCalled(e: DragEvent) {
    if (!e.dataTransfer) return;
    e.dataTransfer.setData("text/rb-all-called", "1");
    e.dataTransfer.setData("text/plain", "All Called");
    e.dataTransfer.effectAllowed = "copy";
  }
</script>

<aside class="sidebar">
  <!-- Cast display mode toggle -->
  <section>
    <div class="section-head">
      <h3>Cast <span class="count">({show.cast.length})</span></h3>
      {#if oneditcast}
        <button
          type="button"
          class="edit-btn"
          aria-label="Edit cast"
          title="Edit cast"
          onclick={oneditcast}
        >
          ✎
        </button>
      {/if}
    </div>
    <p class="drag-hint">Drag onto a day to add</p>

    <div class="mode-toggle" role="group" aria-label="Cast display mode">
      {#each [{ value: "actor", label: "Actor" }, { value: "character", label: "Character" }, { value: "both", label: "Both" }] as opt (opt.value)}
        <button
          type="button"
          class="mode-btn"
          class:active={mode === opt.value}
          onclick={() => onsetcastdisplaymode(opt.value as CastDisplayMode)}
        >
          {opt.label}
        </button>
      {/each}
    </div>

    <ul class="chip-list">
      {#each show.cast as member (member.id)}
        <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
        <li
          draggable="true"
          ondragstart={(e) => dragActor(e, member)}
        >
          <CastChip
            {member}
            {mode}
            displayName={sidebarDisplayNames.get(member.id)}
          />
        </li>
      {/each}
    </ul>
  </section>

  <section>
    <div class="section-head">
      <h3>Groups <span class="count">({show.groups.length})</span></h3>
      {#if groupFormFor !== "new"}
        <button
          type="button"
          class="edit-btn"
          aria-label="Add group"
          title="Add group"
          onclick={onaddgroupblocked ?? openAddGroup}
        >
          +
        </button>
      {/if}
    </div>

    <!-- All Called lives with the groups since it functions like a
         "the whole cast" super-group. Same drag semantics as a group chip. -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="group-row all-called-row"
      role="button"
      tabindex="0"
      draggable="true"
      ondragstart={dragAllCalled}
      title="Drag onto a day to call everyone"
      aria-label="All Called - drag onto a day"
    >
      <span
        class="group-chip-inline all-called-inline"
        style:--group-color="#5b1a2b"
      >
        <span class="group-icon" aria-hidden="true">★</span>
        <span class="group-name">All Called</span>
      </span>
    </div>

    {#if show.groups.length > 0}
      <ul class="group-list">
        {#each show.groups as group (group.id)}
          <li
            class="group-row"
            draggable="true"
            ondragstart={(e) => dragGroup(e, group)}
          >
            <GroupChip {group} />
            <div class="group-actions">
              <button
                type="button"
                class="mini-btn"
                aria-label={`Edit ${group.name}`}
                title="Edit group"
                onclick={() => openEditGroup(group)}
              >
                ✎
              </button>
              <button
                type="button"
                class="mini-btn mini-btn-danger"
                aria-label={`Delete ${group.name}`}
                title="Delete group"
                onclick={() => onremovegroup(group.id)}
              >
                ×
              </button>
            </div>
          </li>
        {/each}
      </ul>
    {/if}

    {#if groupFormFor !== null}
      <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
      <div
        class="group-form"
        bind:this={groupFormEl}
        role="form"
        aria-label={groupFormFor === "new" ? "Add group" : "Edit group"}
        onkeydown={handleGroupFormKey}
      >
        <div class="group-form-name-row">
          <input
            type="text"
            value={groupFormName}
            placeholder="Group name (e.g. Ensemble)"
            oninput={(e) => (groupFormName = e.currentTarget.value)}
          />
          <div class="group-color-anchor">
            <button
              type="button"
              class="group-color-btn"
              style:background={groupFormColor ?? "var(--color-text-muted)"}
              title="Pick group color"
              aria-label="Pick group color"
              onclick={(e) => openColorPopover(e, "form")}
            ></button>
            {#if groupColorFor === "form"}
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <div
                class="group-color-popover"
                style:top="{colorPopoverPos.top}px"
                style:left="{colorPopoverPos.left}px"
                onclick={(e) => e.stopPropagation()}
              >
                {#each CAST_COLOR_PALETTE as hex (hex)}
                  <button
                    type="button"
                    class="gc-swatch"
                    class:selected={groupFormColor === hex}
                    style:background={hex}
                    aria-label={hex}
                    onclick={() => {
                      groupFormColor = hex;
                      groupColorFor = null;
                    }}
                  ></button>
                {/each}
              </div>
            {/if}
          </div>
        </div>
        <div class="form-label">Members</div>
        <ul class="group-member-list">
          {#each show.cast as member (member.id)}
            {@const checked = groupFormMembers.has(member.id)}
            <li>
              <label class="member-row">
                <input
                  type="checkbox"
                  {checked}
                  onchange={() => toggleGroupMember(member.id)}
                />
                <span
                  class="swatch"
                  style:background={member.color}
                  aria-hidden="true"
                ></span>
                <span class="name">{displayNames.get(member.id) ?? member.firstName}</span>
                <span class="character">{member.character}</span>
              </label>
            </li>
          {/each}
        </ul>
        <div class="form-actions">
          <button type="button" class="link-btn" onclick={cancelGroupForm}>
            Cancel
          </button>
          <button
            type="button"
            class="primary-btn"
            disabled={!groupFormName.trim()}
            onclick={commitGroupForm}
          >
            {groupFormFor === "new" ? "Add group" : "Save"}
          </button>
        </div>
      </div>
    {/if}
  </section>
</aside>

<style>
  .sidebar {
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
    min-width: 0;
  }

  section {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  h3 {
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--color-text-subtle);
    margin: 0;
    font-weight: 700;
  }

  .section-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
  }

  .edit-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.5rem;
    height: 1.5rem;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-full);
    background: transparent;
    color: var(--color-text-muted);
    font-size: 0.75rem;
    cursor: pointer;
    padding: 0;
    line-height: 1;
    transition:
      background var(--transition-fast),
      color var(--transition-fast),
      border-color var(--transition-fast);
  }
  .edit-btn:hover {
    background: var(--color-bg-alt);
    color: var(--color-plum);
    border-color: var(--color-plum);
  }

  .count {
    color: var(--color-text-subtle);
    font-weight: 500;
  }

  .drag-hint {
    font-size: 0.6875rem;
    color: var(--color-text-subtle);
    font-style: italic;
    margin: 0;
  }

  .mode-toggle {
    display: flex;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-full);
    overflow: hidden;
    background: var(--color-bg-alt);
  }

  .mode-btn {
    flex: 1;
    font: inherit;
    font-size: 0.6875rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    padding: var(--space-1) var(--space-2);
    border: none;
    background: transparent;
    color: var(--color-text-muted);
    cursor: pointer;
    transition:
      background var(--transition-fast),
      color var(--transition-fast);
  }
  .mode-btn:hover {
    color: var(--color-plum);
  }
  .mode-btn.active {
    background: var(--color-plum);
    color: var(--color-text-inverse);
  }

  .group-chip-inline {
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

  .group-icon {
    font-size: 0.6875rem;
    flex-shrink: 0;
  }

  .all-called-row {
    margin-bottom: var(--space-1);
  }

  .chip-list,
  .group-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .chip-list li,
  .group-row {
    cursor: grab;
  }
  .chip-list li:active,
  .group-row:active {
    cursor: grabbing;
  }

  .group-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .group-color-anchor {
    position: relative;
    flex-shrink: 0;
  }

  .group-color-btn {
    width: 1.25rem;
    height: 1.25rem;
    border-radius: var(--radius-full);
    border: 2px solid var(--color-surface);
    box-shadow: 0 0 0 1px var(--color-border-strong);
    cursor: pointer;
    padding: 0;
    transition: box-shadow var(--transition-fast);
  }
  .group-color-btn:hover {
    box-shadow: 0 0 0 2px var(--color-plum);
  }

  .group-color-popover {
    position: fixed;
    z-index: 120;
    display: flex;
    flex-wrap: wrap;
    gap: 3px;
    padding: var(--space-2);
    background: var(--color-surface);
    border: 1px solid var(--color-border-strong);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-lg);
    width: 220px;
  }

  .gc-swatch {
    width: 20px;
    height: 20px;
    border-radius: var(--radius-full);
    border: 2px solid transparent;
    cursor: pointer;
    padding: 0;
    transition: transform var(--transition-fast);
  }
  .gc-swatch:hover {
    transform: scale(1.15);
  }
  .gc-swatch.selected {
    border-color: var(--color-plum);
    box-shadow: 0 0 0 2px var(--color-surface), 0 0 0 3px var(--color-plum);
  }

  .group-actions {
    display: flex;
    gap: var(--space-1);
    margin-left: auto;
  }

  .mini-btn {
    width: 1.25rem;
    height: 1.25rem;
    padding: 0;
    border: 1px solid transparent;
    background: transparent;
    border-radius: var(--radius-sm);
    font-size: 0.75rem;
    cursor: pointer;
    color: var(--color-text-subtle);
    line-height: 1;
  }
  .mini-btn:hover {
    color: var(--color-plum);
    border-color: var(--color-border);
  }
  .mini-btn-danger:hover {
    color: var(--color-danger);
    border-color: var(--color-danger);
  }

  .group-form {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-3);
    background: var(--color-bg-alt);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
  }

  .group-form-name-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .group-form-name-row input[type="text"] {
    flex: 1;
    min-width: 0;
  }

  .group-form input[type="text"] {
    font: inherit;
    font-size: 0.875rem;
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--color-border-strong);
    border-radius: var(--radius-sm);
    background: var(--color-surface);
    color: var(--color-text);
  }
  .group-form input[type="text"]:focus {
    outline: 2px solid var(--color-teal);
    outline-offset: 0;
    border-color: var(--color-teal);
  }

  .form-label {
    font-size: 0.6875rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--color-text-subtle);
    font-weight: 700;
  }

  .group-member-list {
    list-style: none;
    padding: 0;
    margin: 0;
    max-height: 180px;
    overflow-y: auto;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: var(--color-surface);
  }

  .member-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-1) var(--space-2);
    cursor: pointer;
    font-size: 0.75rem;
  }
  .member-row:hover {
    background: var(--color-bg-alt);
  }
  .swatch {
    width: 8px;
    height: 8px;
    border-radius: var(--radius-full);
    flex-shrink: 0;
  }
  .name {
    font-weight: 600;
    color: var(--color-text);
  }
  .character {
    color: var(--color-text-muted);
    font-size: 0.625rem;
    margin-left: auto;
  }

  .form-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2);
  }
  .link-btn {
    background: none;
    border: none;
    color: var(--color-text-muted);
    font-size: 0.75rem;
    font-weight: 600;
    cursor: pointer;
    padding: var(--space-1) var(--space-2);
  }
  .primary-btn {
    background: var(--color-plum);
    color: var(--color-text-inverse);
    border: none;
    padding: var(--space-1) var(--space-3);
    border-radius: var(--radius-sm);
    font-size: 0.75rem;
    font-weight: 700;
    cursor: pointer;
  }
  .primary-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
</style>
