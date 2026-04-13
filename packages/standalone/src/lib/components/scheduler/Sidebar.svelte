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
    CrewDisplayMode,
    CrewMember,
    Group,
    ScheduleDoc,
  } from "@rehearsal-block/core";
  import { CAST_COLOR_PALETTE, castDisplayNames, crewFirstNameLabels, locationColor } from "@rehearsal-block/core";
  import CastChip from "./CastChip.svelte";
  import GroupChip from "./GroupChip.svelte";
  import { fadeWhenClipped } from "$lib/fade-when-clipped";

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
    /** Update the crew display mode (name/role/both). */
    onsetcrewdisplaymode?: (mode: CrewDisplayMode) => void;
    /** Create a new group. The parent assigns the final id. */
    onaddgroup: (group: Group) => void;
    /** If provided, the + Add group button triggers this instead of
     *  opening the inline form. Used by demo to show the paywall. */
    onaddgroupblocked?: () => void;
    /** When true, editing an existing group (rename, recolor, delete)
     *  triggers onaddgroupblocked instead of opening the edit form. */
    editGroupLocked?: boolean;
    /** Update an existing group (name and/or member list). */
    onupdategroup: (id: string, patch: Partial<Group>) => void;
    /** Remove a group entirely. Any calls that referenced it lose the group. */
    onremovegroup: (id: string) => void;
    /** Whether the sidebar is currently collapsed to just a narrow strip. */
    collapsed?: boolean;
    /** Toggle the collapsed state. */
    oncollapsetoggle?: () => void;
    /** Update the built-in "All Called" chip - label, color, or visibility. */
    onchangeallcalled?: (patch: { label?: string; color?: string; visible?: boolean }) => void;
  }

  const {
    show,
    oneditcast,
    onsetcastdisplaymode,
    onsetcrewdisplaymode,
    onaddgroup,
    onaddgroupblocked,
    editGroupLocked = false,
    onupdategroup,
    onremovegroup,
    collapsed = false,
    oncollapsetoggle,
    onchangeallcalled,
  }: Props = $props();

  let sidebarView = $state<"cast" | "crew">("cast");
  /** Whether the display-mode dropdown is open (cast or crew mode selector). */
  let modeDropdownOpen = $state(false);

  const mode = $derived<CastDisplayMode>(show.settings.castDisplayMode ?? "actor");
  const crewMode = $derived<CrewDisplayMode>(show.settings.crewDisplayMode ?? "both");

  // ---- Display mode dropdown options + labels ----
  const CAST_MODE_OPTIONS: { value: CastDisplayMode; label: string }[] = [
    { value: "actor", label: "Actor" },
    { value: "character", label: "Character" },
    { value: "both", label: "Both" },
  ];
  const CREW_MODE_OPTIONS: { value: CrewDisplayMode; label: string }[] = [
    { value: "name", label: "Name" },
    { value: "role", label: "Role" },
    { value: "both", label: "Both" },
  ];
  const currentModeLabel = $derived.by(() => {
    if (sidebarView === "cast") {
      return CAST_MODE_OPTIONS.find((o) => o.value === mode)?.label ?? "Actor";
    }
    return CREW_MODE_OPTIONS.find((o) => o.value === crewMode)?.label ?? "Both";
  });

  function chooseCastMode(value: CastDisplayMode) {
    onsetcastdisplaymode(value);
    modeDropdownOpen = false;
  }
  function chooseCrewMode(value: CrewDisplayMode) {
    onsetcrewdisplaymode?.(value);
    modeDropdownOpen = false;
  }

  /**
   * Close the mode dropdown when clicking outside of it. Use composedPath()
   * per CLAUDE.md convention since Svelte 5 may unmount clicked elements
   * before the event finishes bubbling.
   */
  function handleWindowClick(e: MouseEvent) {
    if (!modeDropdownOpen) return;
    const path = e.composedPath();
    const inDropdown = path.some((el) => {
      if (!(el instanceof HTMLElement)) return false;
      return el.classList.contains("mode-dropdown-wrap");
    });
    if (!inDropdown) modeDropdownOpen = false;
  }

  function handleWindowKey(e: KeyboardEvent) {
    if (e.key !== "Escape") return;
    if (pendingDelete) {
      cancelDelete();
      e.preventDefault();
      return;
    }
    if (allCalledFormOpen) {
      cancelAllCalledForm();
      e.preventDefault();
      return;
    }
    if (groupFormFor !== null) {
      cancelGroupForm();
      e.preventDefault();
      return;
    }
    if (modeDropdownOpen) {
      modeDropdownOpen = false;
      e.preventDefault();
    }
  }

  // Close dropdown if user switches cast/crew view while it's open
  $effect(() => {
    const _view = sidebarView;
    modeDropdownOpen = false;
  });
  /** Grid chips use the mode-aware short names (first name, character, etc.).
   *  Pool-aware: crew-side first-name collisions drive cast-side disambiguation. */
  const displayNames = $derived(castDisplayNames(show.cast, mode, show.crew));
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
  /**
   * Disambiguated first-name labels for crew members. Cross-pool aware
   * so "Marcus Chen" (cast) / "Marcus Webb" (crew) both get initials.
   */
  const crewLabels = $derived(crewFirstNameLabels(show.cast, show.crew));

  // Group color popover: which group's picker is open (null = none).
  let groupColorFor = $state<string | null>(null);
  let colorPopoverPos = $state<{ top: number; left: number }>({ top: 0, left: 0 });

  /**
   * Svelte action that moves an element to document.body when mounted
   * and back / removed when destroyed. Used to portal the color picker
   * popover out of the sidebar's overflow:hidden ancestor stack so the
   * popover isn't visually clipped (Chromium quirk: position:fixed
   * descendants of a sticky parent with overflow:hidden still get
   * clipped, against spec).
   */
  function portalToBody(node: HTMLElement) {
    document.body.appendChild(node);
    return {
      destroy() {
        node.remove();
      },
    };
  }

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

  /**
   * Position of the currently-open edit popover. null when no form is
   * open. Captured from the click event of the button that opened it,
   * so the popover appears near the user's mouse rather than pushing
   * the rest of the sidebar around.
   */
  let formPopoverPos = $state<{ top: number; left: number } | null>(null);

  function capturePopoverPos(e: MouseEvent) {
    // Anchor the popover near the clicked button. We use approximate
    // form dimensions (320x420) to clamp the position so the popover
    // stays on screen even when the user clicks a button near the edge
    // of the viewport. The form also has its own max-height + overflow
    // as a safety net.
    const btn = e.currentTarget as HTMLElement;
    const rect = btn.getBoundingClientRect();
    const viewportW = typeof window !== "undefined" ? window.innerWidth : 1280;
    const viewportH = typeof window !== "undefined" ? window.innerHeight : 800;
    const formW = 320;
    const formH = 420;
    const pad = 8;

    // Prefer placing the popover below the button, but flip above if
    // there isn't room. If neither side has room, clamp to top edge.
    let top: number;
    const spaceBelow = viewportH - rect.bottom - pad;
    const spaceAbove = rect.top - pad;
    if (spaceBelow >= formH) {
      top = rect.bottom + 6;
    } else if (spaceAbove >= formH) {
      top = rect.top - formH - 6;
    } else {
      // Not enough room either side - center as best we can.
      top = Math.max(pad, viewportH - formH - pad);
    }
    top = Math.max(pad, Math.min(top, viewportH - pad - 40));

    // Horizontally align the popover's right edge with the button's
    // right edge so the eye travels from the click to the form header.
    let left = rect.right - formW;
    left = Math.max(pad, Math.min(left, viewportW - formW - pad));

    formPopoverPos = { top, left };
  }

  function openAddGroup(e: MouseEvent) {
    allCalledFormOpen = false;
    groupFormFor = "new";
    groupFormName = "";
    groupFormMembers = new Set();
    groupFormColor = undefined;
    groupColorFor = null;
    capturePopoverPos(e);
    // Focus the group name input after the form renders
    requestAnimationFrame(() => {
      queueMicrotask(() => {
        groupFormEl?.querySelector<HTMLInputElement>("input[type='text']")?.focus();
      });
    });
  }

  function openEditGroup(group: Group, e: MouseEvent) {
    if (editGroupLocked) {
      onaddgroupblocked?.();
      return;
    }
    allCalledFormOpen = false;
    groupFormFor = group.id;
    groupFormName = group.name;
    groupFormMembers = new Set(group.memberIds);
    groupFormColor = group.color ?? locationColor(group.id) ?? undefined;
    groupColorFor = null;
    capturePopoverPos(e);
  }

  function cancelGroupForm() {
    groupFormFor = null;
    groupFormName = "";
    groupFormMembers = new Set();
    groupFormColor = undefined;
    groupColorFor = null;
    formPopoverPos = null;
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

  // ---- "All Called" chip customization ----
  // Derived from settings with defaults. The chip can be renamed,
  // recolored, or hidden entirely via its edit/delete buttons.
  const ALL_CALLED_DEFAULT_COLOR = "#5b1a2b";
  const allCalledLabel = $derived(
    show.settings.allCalledLabel?.trim() || "All Called",
  );
  const allCalledColor = $derived(
    show.settings.allCalledColor || ALL_CALLED_DEFAULT_COLOR,
  );
  const allCalledVisible = $derived(
    show.settings.allCalledVisible !== false,
  );

  // Local edit form state. Opens when the user clicks the pencil on
  // the All Called chip. Form lets them change the label and color
  // and previews the full cast list as a "verify everyone is here" aid.
  let allCalledFormOpen = $state(false);
  let allCalledFormLabel = $state("");
  let allCalledFormColor = $state(ALL_CALLED_DEFAULT_COLOR);
  let allCalledFormEl = $state<HTMLDivElement | null>(null);

  function openAllCalledForm(e: MouseEvent) {
    if (editGroupLocked) {
      onaddgroupblocked?.();
      return;
    }
    // Close any other open form first
    cancelGroupForm();
    allCalledFormOpen = true;
    allCalledFormLabel = allCalledLabel;
    allCalledFormColor = allCalledColor;
    groupColorFor = null;
    capturePopoverPos(e);
  }

  function cancelAllCalledForm() {
    allCalledFormOpen = false;
    groupColorFor = null;
    formPopoverPos = null;
  }

  function commitAllCalledForm() {
    const label = allCalledFormLabel.trim();
    if (!label) return;
    onchangeallcalled?.({ label, color: allCalledFormColor });
    cancelAllCalledForm();
  }

  function deleteAllCalled() {
    onchangeallcalled?.({ visible: false });
    cancelAllCalledForm();
  }

  // ---- Delete confirmation dialog ----
  // Shared between All Called and regular groups. When set, a modal
  // asks the user to confirm before the actual delete fires.
  type PendingDelete =
    | { kind: "group"; id: string; name: string }
    | { kind: "all-called"; name: string };
  let pendingDelete = $state<PendingDelete | null>(null);

  function requestDeleteGroup(group: Group) {
    if (editGroupLocked) {
      onaddgroupblocked?.();
      return;
    }
    pendingDelete = { kind: "group", id: group.id, name: group.name };
  }

  function requestDeleteAllCalled() {
    if (editGroupLocked) {
      onaddgroupblocked?.();
      return;
    }
    pendingDelete = { kind: "all-called", name: allCalledLabel };
  }

  function confirmDelete() {
    if (!pendingDelete) return;
    if (pendingDelete.kind === "group") {
      onremovegroup(pendingDelete.id);
    } else {
      deleteAllCalled();
    }
    pendingDelete = null;
  }

  function cancelDelete() {
    pendingDelete = null;
  }

  function handleAllCalledFormKey(e: KeyboardEvent) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      commitAllCalledForm();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancelAllCalledForm();
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

  function dragCrew(e: DragEvent, member: CrewMember) {
    if (!e.dataTransfer) return;
    e.dataTransfer.setData("text/rb-crew", member.id);
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

<svelte:window onclick={handleWindowClick} onkeydown={handleWindowKey} />

<aside class="sidebar" class:collapsed>
  {#if collapsed}
    <!-- Collapsed state: only the expand button is visible -->
    {#if oncollapsetoggle}
      <button
        type="button"
        class="sidebar-collapse-toggle collapsed-state"
        title="Show cast toolbar"
        aria-label="Show cast toolbar"
        aria-expanded="false"
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
  {:else}
  <!-- Always-visible header: Cast/Team toggle, collapse button,
       drag hint, mode dropdown. Stays at the top of the sidebar even
       when the chip list + groups scroll below it. -->
  <div class="sidebar-header">
    <div class="section-head">
      <button
        type="button"
        class="sidebar-view-toggle"
        aria-label="Toggle between cast and production team"
        title="Click to switch between cast and production team"
        onclick={() => (sidebarView = sidebarView === "cast" ? "crew" : "cast")}
      >
        <span class="sidebar-view-label">
          {sidebarView === "cast" ? "Cast" : "Team"}
          <span class="count">({sidebarView === "cast" ? show.cast.length : show.crew.length})</span>
        </span>
        <svg class="toggle-arrow" width="12" height="12" viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true">
          <path d="M480-344 240-584l56-56 184 184 184-184 56 56-240 240Z"/>
        </svg>
      </button>
      {#if oncollapsetoggle}
        <button
          type="button"
          class="sidebar-collapse-toggle expanded-state"
          title="Hide cast toolbar"
          aria-label="Hide cast toolbar"
          aria-expanded="true"
          onclick={oncollapsetoggle}
        >
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
    </div>

    <p class="drag-hint">Drag onto a day to add</p>

    <div class="mode-dropdown-wrap">
      <button
        type="button"
        class="mode-dropdown-btn"
        aria-label={sidebarView === "cast" ? "Cast display mode" : "Crew display mode"}
        aria-haspopup="listbox"
        aria-expanded={modeDropdownOpen}
        onclick={(e) => { e.stopPropagation(); modeDropdownOpen = !modeDropdownOpen; }}
      >
        <span class="mode-label">{currentModeLabel}</span>
        <svg class="toggle-arrow" width="12" height="12" viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true">
          <path d="M480-344 240-584l56-56 184 184 184-184 56 56-240 240Z"/>
        </svg>
      </button>
      {#if modeDropdownOpen}
        <ul class="mode-menu" role="listbox">
          {#if sidebarView === "cast"}
            {#each CAST_MODE_OPTIONS as opt (opt.value)}
              <li>
                <button
                  type="button"
                  class="mode-menu-item"
                  class:active={mode === opt.value}
                  role="option"
                  aria-selected={mode === opt.value}
                  onclick={() => chooseCastMode(opt.value)}
                >
                  {opt.label}
                </button>
              </li>
            {/each}
          {:else}
            {#each CREW_MODE_OPTIONS as opt (opt.value)}
              <li>
                <button
                  type="button"
                  class="mode-menu-item"
                  class:active={crewMode === opt.value}
                  role="option"
                  aria-selected={crewMode === opt.value}
                  onclick={() => chooseCrewMode(opt.value)}
                >
                  {opt.label}
                </button>
              </li>
            {/each}
          {/if}
        </ul>
      {/if}
    </div>
  </div>

  <!-- Scrollable content: chip list + groups section.
       Scrolls independently below the sticky header so the toolbar
       controls stay accessible at all times. -->
  <div class="sidebar-scroll">
    <section>
      {#if sidebarView === "cast"}
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
      {:else}
        <ul class="chip-list crew-list">
          {#each show.crew as member (member.id)}
            <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
            <li
              draggable="true"
              ondragstart={(e) => dragCrew(e, member)}
            >
              <span
                class="crew-chip-sidebar"
                style:--chip-color={member.color}
                title={`${member.firstName} ${member.lastName} - ${member.role}`}
              >
                <span class="crew-sidebar-square" style:background={member.color}></span>
                {#if crewMode === "both"}
                  <!-- "Both" mode: split into name + role spans so the
                       role's text-overflow:ellipsis lives on the role
                       element itself. The "..." then inherits the
                       role's muted color instead of the dark label
                       color it had when ellipsis was on the parent. -->
                  <span class="crew-sidebar-label crew-sidebar-label-both">
                    <span class="crew-sidebar-name">
                      {crewLabels.get(member.id) ?? member.firstName}
                    </span>
                    <span class="crew-sidebar-role" use:fadeWhenClipped>
                      {member.role}
                    </span>
                  </span>
                {:else}
                  <span class="crew-sidebar-label" use:fadeWhenClipped>
                    {#if crewMode === "name"}
                      {member.firstName} {member.lastName}
                    {:else}
                      {member.role || (crewLabels.get(member.id) ?? member.firstName)}
                    {/if}
                  </span>
                {/if}
              </span>
            </li>
          {/each}
          {#if show.crew.length === 0}
            <li class="crew-empty">No production team members. Add them in Default Settings > Contacts.</li>
          {/if}
        </ul>
      {/if}
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
          onclick={(e) => {
            e.stopPropagation();
            if (editGroupLocked && onaddgroupblocked) onaddgroupblocked();
            else openAddGroup(e);
          }}
        >
          +
        </button>
      {/if}
    </div>

    <!-- All Called lives with the groups since it functions like a
         "the whole cast" super-group. Same drag semantics as a group
         chip. Label, color, and visibility are customizable via the
         edit/delete buttons (identical pattern to user-added groups). -->
    {#if allCalledVisible}
      <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
      <div class="group-row all-called-row">
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class="all-called-drag"
          role="button"
          tabindex="0"
          draggable="true"
          ondragstart={dragAllCalled}
          title="{allCalledLabel} ({show.cast.length} member{show.cast.length === 1 ? '' : 's'})"
          aria-label="{allCalledLabel} ({show.cast.length} members)"
        >
          <span
            class="group-chip-inline all-called-inline"
            style:--group-color={allCalledColor}
          >
            <span class="group-icon" aria-hidden="true">★</span>
            <span class="group-name">{allCalledLabel}</span>
          </span>
        </div>
        <div class="group-actions">
          <button
            type="button"
            class="mini-btn"
            aria-label={`Edit ${allCalledLabel}`}
            title="Edit"
            onclick={(e) => { e.stopPropagation(); openAllCalledForm(e); }}
          >
            ✎
          </button>
          <button
            type="button"
            class="mini-btn mini-btn-danger"
            aria-label={`Delete ${allCalledLabel}`}
            title="Delete"
            onclick={requestDeleteAllCalled}
          >
            ×
          </button>
        </div>
      </div>
    {/if}

    {#if allCalledFormOpen}
      <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
      <div
        class="group-form floating"
        class:has-position={!!formPopoverPos}
        bind:this={allCalledFormEl}
        role="form"
        aria-label="Edit All Called"
        style:top={formPopoverPos ? `${formPopoverPos.top}px` : undefined}
        style:left={formPopoverPos ? `${formPopoverPos.left}px` : undefined}
        onkeydown={handleAllCalledFormKey}
        onclick={(e) => e.stopPropagation()}
      >
        <div class="group-form-name-row">
          <input
            type="text"
            value={allCalledFormLabel}
            placeholder="All Called"
            oninput={(e) => (allCalledFormLabel = e.currentTarget.value)}
          />
          <div class="group-color-anchor">
            <button
              type="button"
              class="group-color-btn"
              style:background={allCalledFormColor}
              title="Pick chip color"
              aria-label="Pick chip color"
              onclick={(e) => openColorPopover(e, "all-called")}
            ></button>
            <!-- Color popover is rendered at the bottom of the file
                 (outside the form) so it isn't clipped by the form's
                 overflow:auto. -->
          </div>
        </div>
        <div class="form-label">Includes everyone in the cast ({show.cast.length})</div>
        <ul class="group-member-list">
          {#each show.cast as member (member.id)}
            <li>
              <div class="member-row all-called-member-row" title="Always included - this chip calls everyone">
                <span class="all-called-check" aria-hidden="true">✓</span>
                <span
                  class="swatch"
                  style:background={member.color}
                  aria-hidden="true"
                ></span>
                <span class="name">{displayNames.get(member.id) ?? member.firstName}</span>
                <span class="character">{member.character}</span>
              </div>
            </li>
          {/each}
        </ul>
        <div class="form-actions">
          <button type="button" class="link-btn" onclick={cancelAllCalledForm}>
            Cancel
          </button>
          <button
            type="button"
            class="primary-btn"
            disabled={!allCalledFormLabel.trim()}
            onclick={commitAllCalledForm}
          >
            Save
          </button>
        </div>
      </div>
    {/if}

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
                onclick={(e) => { e.stopPropagation(); openEditGroup(group, e); }}
              >
                ✎
              </button>
              <button
                type="button"
                class="mini-btn mini-btn-danger"
                aria-label={`Delete ${group.name}`}
                title="Delete group"
                onclick={() => requestDeleteGroup(group)}
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
        class="group-form floating"
        class:has-position={!!formPopoverPos}
        bind:this={groupFormEl}
        role="form"
        aria-label={groupFormFor === "new" ? "Add group" : "Edit group"}
        style:top={formPopoverPos ? `${formPopoverPos.top}px` : undefined}
        style:left={formPopoverPos ? `${formPopoverPos.left}px` : undefined}
        onkeydown={handleGroupFormKey}
        onclick={(e) => e.stopPropagation()}
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
            <!-- Color popover is rendered at the bottom of the file
                 (outside the form) so it isn't clipped by the form's
                 overflow:auto. -->
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
  </div>
  {/if}
</aside>

<!-- Backdrop for open floating forms. Clicking anywhere outside the
     form (including the sidebar itself) closes the form without saving. -->
{#if formPopoverPos && (allCalledFormOpen || groupFormFor !== null)}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="form-popover-backdrop"
    onclick={() => {
      if (allCalledFormOpen) cancelAllCalledForm();
      if (groupFormFor !== null) cancelGroupForm();
    }}
  ></div>
{/if}

<!-- Hoisted color picker popover. Portaled to document.body via the
     `use:portalToBody` action so it has NO clipping ancestors at all.
     Even with `position: fixed`, an ancestor with `overflow: hidden`
     was visually clipping the popover (Chromium quirk with sticky +
     overflow), so the only reliable fix is to move the actual DOM
     element to document.body. -->
{#if groupColorFor !== null && (allCalledFormOpen || groupFormFor !== null)}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    use:portalToBody
    class="group-color-popover"
    style:top="{colorPopoverPos.top}px"
    style:left="{colorPopoverPos.left}px"
    onclick={(e) => e.stopPropagation()}
  >
    {#each CAST_COLOR_PALETTE as hex (hex)}
      {@const isAllCalled = groupColorFor === "all-called"}
      {@const isForm = groupColorFor === "form"}
      {@const currentColor = isAllCalled ? allCalledFormColor : groupFormColor}
      <button
        type="button"
        class="gc-swatch"
        class:selected={currentColor === hex}
        style:background={hex}
        aria-label={hex}
        onclick={() => {
          if (isAllCalled) allCalledFormColor = hex;
          else if (isForm) groupFormColor = hex;
          groupColorFor = null;
        }}
      ></button>
    {/each}
  </div>
{/if}

<!-- Delete confirmation dialog, shared between All Called and groups. -->
{#if pendingDelete}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="delete-backdrop" onclick={cancelDelete}></div>
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div
    class="delete-dialog"
    role="dialog"
    aria-modal="true"
    aria-label="Confirm delete"
    tabindex="-1"
    onclick={(e) => e.stopPropagation()}
  >
    <h3>Delete {pendingDelete.name}?</h3>
    <p>
      Are you sure you want to delete <strong>{pendingDelete.name}</strong>?
      {#if pendingDelete.kind === "group"}
        This group will be removed from every day it's called on.
      {:else}
        You'll need to add a new group manually if you want to bring it back.
      {/if}
    </p>
    <div class="delete-actions">
      <button type="button" class="delete-cancel" onclick={cancelDelete}>
        Cancel
      </button>
      <button type="button" class="delete-confirm" onclick={confirmDelete}>
        Delete
      </button>
    </div>
  </div>
{/if}

<style>
  .sidebar {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    min-width: 0;
  }

  /* Always-visible toolbar controls (Cast/Team toggle, collapse button,
   *  drag hint, mode dropdown). Sticks to the top of the enclosing
   *  .scheduler-sidebar scroll container so the toolbar is ALWAYS
   *  accessible even when the chip list + groups are scrolled. */
  .sidebar-header {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    position: sticky;
    top: 0;
    z-index: 5;
    background: var(--color-bg);
    padding-bottom: var(--space-2);
  }

  /* Everything below the sticky header. Scrolls naturally with the
   *  enclosing .scheduler-sidebar overflow. */
  .sidebar-scroll {
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
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
    justify-content: flex-start;
    gap: var(--space-2);
  }

  .sidebar-view-toggle {
    display: inline-flex;
    align-items: center;
    justify-content: flex-start;
    gap: var(--space-2);
    width: auto;
    font: inherit;
    font-size: 0.75rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--color-teal);
    border-radius: var(--radius-full);
    background: var(--color-teal);
    color: var(--color-text-inverse);
    cursor: pointer;
    transition:
      background var(--transition-fast),
      color var(--transition-fast);
  }
  .sidebar-view-toggle:hover {
    background: var(--color-teal-dark);
    border-color: var(--color-teal-dark);
  }
  .sidebar-view-label {
    text-align: left;
  }
  .sidebar-view-toggle .count {
    font-weight: 500;
    /* Use an explicit off-white color instead of low opacity. Opacity
       lets the teal background bleed through and makes the text look
       teal-tinted; an explicit pale color stays neutral and readable
       while reading as "secondary" against the bold white label. */
    color: rgba(255, 255, 255, 0.5);
    margin-left: var(--space-1);
  }
  .toggle-arrow {
    flex-shrink: 0;
    opacity: 0.9;
  }

  /* ---- Collapse toggle button ---- */
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
  .sidebar-collapse-toggle.expanded-state {
    margin-left: auto;
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

  .sidebar.collapsed {
    align-items: center;
  }

  .crew-list {
    list-style: none;
    padding: 0;
    margin: 0;
  }

  .crew-chip-sidebar {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-left: 3px solid var(--chip-color);
    border-radius: var(--radius-full, 999px);
    font-size: 0.8125rem;
    line-height: 1.2;
    cursor: grab;
    max-width: 100%;
    overflow: hidden;
  }

  /* "Both" mode (chip has both name + role): the role text often
     overflows. Force the chip to fill its row, then lay a gradient
     overlay across the rightmost ~28px so the text fades into the
     chip's background while the border + border-radius + colored
     left stripe stay fully intact. */
  .crew-chip-sidebar:has(.crew-sidebar-role) {
    display: flex;
    width: 100%;
    position: relative;
  }
  /* Fade overlay only renders when the chip is actually overflowing.
     The .is-overflowing class is toggled by the fadeWhenClipped action
     on .crew-sidebar-label via a ResizeObserver, so chips with short
     names stay clean (no fade artifacts on the right edge). The
     :global() wrapper on the dynamic class lets Svelte's static
     analysis see the rule as used. */
  .crew-chip-sidebar:has(.crew-sidebar-role):global(.is-overflowing)::after {
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

  .crew-chip-sidebar:active {
    cursor: grabbing;
  }

  .crew-sidebar-square {
    width: 6px;
    height: 6px;
    border-radius: 1px;
    flex-shrink: 0;
  }

  .crew-sidebar-label {
    font-weight: 600;
    color: var(--color-text);
    white-space: nowrap;
    /* In name/role single-text modes, the label IS the ellipsis
       carrier (its color = the visible text color = dark, so the
       ellipsis matches). In "both" mode the .crew-sidebar-label-both
       modifier below switches it to a flex layout and the role child
       handles its own ellipsis instead. */
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* "Both" mode: flex layout that lets the role span shrink and show
     its own muted-color ellipsis. The name span stays at content size
     (flex-shrink: 0) so we never lose any of the actor's name. */
  .crew-sidebar-label-both {
    display: flex;
    align-items: baseline;
    gap: 4px;
    /* No text-overflow on the parent in this mode - the role child
       carries it instead so the "..." inherits the muted color. */
    text-overflow: clip;
  }

  .crew-sidebar-name {
    flex-shrink: 0;
    /* Inherits font-weight: 600 and color: var(--color-text) from
       the parent .crew-sidebar-label, so the name stays bold/dark. */
  }

  .crew-sidebar-role {
    font-size: 0.75rem;
    font-weight: 400;
    color: var(--color-text-muted);
    /* When inside .crew-sidebar-label-both this becomes the
       overflowing element. Its own text-overflow:ellipsis means
       the "..." renders in the muted color instead of the dark
       color it would inherit from the parent label. */
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .crew-empty {
    font-size: 0.75rem;
    color: var(--color-text-muted);
    font-style: italic;
    padding: var(--space-2) 0;
    list-style: none;
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
    margin: 0;
    font-size: 0.6rem;
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .mode-dropdown-wrap {
    position: relative;
    display: inline-block;
    width: auto;
  }

  .mode-dropdown-btn {
    display: inline-flex;
    align-items: center;
    justify-content: flex-start;
    gap: var(--space-2);
    width: auto;
    font: inherit;
    font-size: 0.6875rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-full);
    background: var(--color-bg-alt);
    color: var(--color-text-muted);
    cursor: pointer;
    transition:
      background var(--transition-fast),
      color var(--transition-fast),
      border-color var(--transition-fast);
  }
  .mode-dropdown-btn:hover {
    color: var(--color-plum);
    border-color: var(--color-plum);
  }
  .mode-dropdown-btn[aria-expanded="true"] {
    color: var(--color-plum);
    border-color: var(--color-plum);
    background: var(--color-surface);
  }
  .mode-label {
    text-align: left;
  }

  .mode-menu {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    min-width: 100%;
    list-style: none;
    padding: var(--space-1);
    margin: 0;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-md);
    z-index: 20;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .mode-menu-item {
    display: block;
    width: 100%;
    text-align: left;
    font: inherit;
    font-size: 0.75rem;
    font-weight: 600;
    padding: var(--space-2) var(--space-3);
    border: none;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--color-text);
    cursor: pointer;
    transition:
      background var(--transition-fast),
      color var(--transition-fast);
  }
  .mode-menu-item:hover {
    background: var(--color-bg-alt);
    color: var(--color-plum);
  }
  .mode-menu-item.active {
    background: var(--color-plum);
    color: var(--color-text-inverse);
  }
  .mode-menu-item.active:hover {
    background: var(--color-plum-light);
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
    /* The outer row isn't draggable, only its inner .all-called-drag. */
    cursor: default;
  }
  .all-called-row:active {
    cursor: default;
  }
  .all-called-drag {
    flex: 1;
    min-width: 0;
    cursor: grab;
    display: flex;
    align-items: center;
  }
  .all-called-drag:active {
    cursor: grabbing;
  }
  .all-called-drag:focus-visible {
    outline: 2px solid var(--color-plum);
    outline-offset: 2px;
    border-radius: var(--radius-sm);
  }

  /* Read-only member row in the All Called edit form. Visually
   * mirrors .member-row but has a check instead of a checkbox to
   * convey "this list is fixed - everyone is always included". */
  .all-called-member-row {
    cursor: default;
  }
  .all-called-check {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    flex-shrink: 0;
    color: var(--color-teal);
    font-weight: 700;
    font-size: 0.875rem;
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

  /* Long group names used to push the edit/delete buttons off the
     right edge of the sidebar. Let the chip size to its natural
     content but allow it to shrink (min-width: 0) when content gets
     wider than the row's available space. Combined with the fade +
     ellipsis treatment below, this gives the chip a "hugs content,
     truncates when forced" behavior - short groups stay compact,
     long ones fill the row and fade. Scoped to .group-row only so the
     compact variant inside calendar cells keeps its intrinsic sizing. */
  .group-row :global(.group-chip) {
    flex: 0 1 auto;
    min-width: 0;
    max-width: 100%;
    overflow: hidden;
    position: relative;
  }
  /* Fade overlay only renders when the chip is actually overflowing.
     The .is-overflowing class is toggled by the fadeWhenClipped action
     inside GroupChip.svelte via a ResizeObserver, so short group names
     stay clean (no fade artifacts on the right edge). */
  .group-row :global(.group-chip.is-overflowing)::after {
    content: "";
    position: absolute;
    top: 0;
    bottom: 0;
    right: 0;
    /* 22px fade zone running right up to the chip border with no
       solid buffer. Fades to the group's own background color
       (set inline via --group-color on the chip). */
    width: 22px;
    background: linear-gradient(
      to right,
      transparent,
      var(--group-color)
    );
    pointer-events: none;
  }
  .group-row :global(.group-name) {
    overflow: hidden;
    max-width: none;
    white-space: nowrap;
    /* No text-overflow:ellipsis - the parent chip's ::after overlay
       handles the visual fade instead. */
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
    /* Never shrink alongside a long group chip - the edit/delete
       buttons always need to be tappable at full size. */
    flex-shrink: 0;
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

  /* Floating popover variant of the group form.
   * position:fixed escapes the sidebar's overflow, and we anchor it
   * near the click event via inline top/left styles set by the
   * component. z-index > any of the sidebar's sticky elements. */
  .group-form.floating.has-position {
    position: fixed;
    z-index: 160;
    width: 320px;
    max-width: calc(100vw - var(--space-4));
    max-height: calc(100vh - var(--space-5));
    overflow-y: auto;
    background: var(--color-surface);
    box-shadow: var(--shadow-lg);
  }

  .form-popover-backdrop {
    position: fixed;
    inset: 0;
    z-index: 155;
    background: transparent;
  }

  /* Delete confirmation dialog */
  .delete-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(45, 31, 61, 0.4);
    z-index: 200;
  }
  .delete-dialog {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 380px;
    max-width: calc(100vw - 2 * var(--space-4));
    padding: var(--space-5);
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-lg);
    z-index: 210;
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }
  .delete-dialog h3 {
    font-size: 1rem;
    font-weight: 700;
    margin: 0;
    color: var(--color-plum);
  }
  .delete-dialog p {
    font-size: 0.875rem;
    color: var(--color-text);
    margin: 0;
    line-height: 1.5;
  }
  .delete-dialog strong {
    color: var(--color-plum);
  }
  .delete-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2);
    margin-top: var(--space-2);
  }
  .delete-cancel,
  .delete-confirm {
    font: inherit;
    font-size: 0.8125rem;
    font-weight: 600;
    padding: var(--space-2) var(--space-4);
    border-radius: var(--radius-sm);
    cursor: pointer;
    border: 1px solid var(--color-border);
    background: transparent;
    color: var(--color-text-muted);
  }
  .delete-cancel:hover {
    color: var(--color-text);
    border-color: var(--color-text-muted);
  }
  .delete-confirm {
    background: var(--color-danger);
    border-color: var(--color-danger);
    color: var(--color-text-inverse);
  }
  .delete-confirm:hover {
    background: #b91c1c;
    border-color: #b91c1c;
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
