<script lang="ts">
  /**
   * New show creation modal. Collects name + dates (required), then
   * optionally lets the user configure all show settings before creating.
   *
   * Embeds DefaultsModal in "embedded" mode (no backdrop/chrome) so all
   * Appearance, Schedule, Event Types, Locations, and Contacts settings
   * are available without duplicating the 3,900-line DefaultsModal UI.
   */
  import {
    newEmptyScheduleDoc,
    type CastMember,
    type Conflict,
    type CrewMember,
    type EventType,
    type ScheduleDoc,
    type Settings,
    type Show,
  } from "@rehearsal-block/core";
  import { onMount } from "svelte";
  import DefaultsModal from "$lib/components/scheduler/DefaultsModal.svelte";
  import { getUserDefaults } from "$lib/storage/local.js";

  interface Props {
    onclose: () => void;
    oncreate: (doc: ScheduleDoc) => void;
  }

  const { onclose, oncreate }: Props = $props();

  let name = $state("");
  let startDate = $state("");
  let endDate = $state("");
  let error = $state("");
  let showSettings = $state(false);
  const hasDates = $derived(!!(startDate && endDate && endDate >= startDate));

  // Temporary doc that DefaultsModal mutates via callbacks.
  // On "Create show", this fully configured doc is passed upstream.
  let tempDoc = $state<ScheduleDoc>(
    newEmptyScheduleDoc({ name: "", startDate: "2026-01-01", endDate: "2026-03-01" }),
  );

  // Pre-fill from saved "My Defaults" if available.
  // If no defaults are saved, start with blank weekday call times
  // (all unchecked, no times) so the user sets their own schedule.
  const blankWeekdays = Array.from({ length: 7 }, () => ({
    enabled: false,
    startTime: "",
    endTime: "",
  }));

  onMount(async () => {
    const defaults = await getUserDefaults();
    if (defaults) {
      tempDoc.settings = { ...tempDoc.settings, ...defaults.settings };
      tempDoc.eventTypes = defaults.eventTypes;
      tempDoc.locationPresets = defaults.locationPresets;
      if (defaults.locationPresetsV2) {
        tempDoc.locationPresetsV2 = defaults.locationPresetsV2;
      }
    } else {
      // No saved defaults - start with blank weekdays like My Defaults
      tempDoc.settings = { ...tempDoc.settings, weekdayDefaults: blankWeekdays };
    }
  });

  // Keep tempDoc.show in sync with the form fields
  $effect(() => {
    tempDoc.show.name = name.trim();
    tempDoc.show.startDate = startDate || "2026-01-01";
    tempDoc.show.endDate = endDate || "2026-03-01";
  });

  function handleSubmit(e: Event) {
    e.preventDefault();
    error = "";

    const trimmedName = name.trim();
    if (!trimmedName) {
      error = "Give your show a name.";
      return;
    }
    if (!startDate) {
      error = "Pick a start date.";
      return;
    }
    if (!endDate) {
      error = "Pick an end date.";
      return;
    }
    if (endDate < startDate) {
      error = "End date can't be before the start date.";
      return;
    }

    // Ensure final values are synced
    tempDoc.show.name = trimmedName;
    tempDoc.show.startDate = startDate;
    tempDoc.show.endDate = endDate;

    oncreate(tempDoc);
  }

  function handleKey(e: KeyboardEvent) {
    if (e.key === "Escape") onclose();
  }

  // ---- DefaultsModal callbacks: mutate tempDoc in place ----

  function updateSettings(patch: Partial<Settings>) {
    tempDoc.settings = { ...tempDoc.settings, ...patch };
  }

  function updateShow(patch: Partial<Show>) {
    tempDoc.show = { ...tempDoc.show, ...patch };
    // Sync form fields if show name/dates changed from the Show tab
    if (patch.name !== undefined) name = patch.name;
    if (patch.startDate !== undefined) startDate = patch.startDate;
    if (patch.endDate !== undefined) endDate = patch.endDate;
  }

  function addEventType(type: EventType) {
    tempDoc.eventTypes = [...tempDoc.eventTypes, type];
  }
  function updateEventType(id: string, patch: Partial<EventType>) {
    tempDoc.eventTypes = tempDoc.eventTypes.map((t) =>
      t.id === id ? { ...t, ...patch } : t,
    );
  }
  function removeEventType(id: string) {
    tempDoc.eventTypes = tempDoc.eventTypes.filter((t) => t.id !== id);
    if (tempDoc.settings.defaultEventType === id) {
      tempDoc.settings = { ...tempDoc.settings, defaultEventType: "" };
    }
  }
  function assignEventType(typeId: string, iso: string) {
    const existing = tempDoc.schedule[iso];
    tempDoc.schedule = {
      ...tempDoc.schedule,
      [iso]: {
        eventTypeId: typeId,
        calls: existing?.calls ?? [],
        description: existing?.description ?? "",
        notes: existing?.notes ?? "",
        location: existing?.location ?? "",
      },
    };
    if (!tempDoc.settings.defaultsAssignedDates.includes(iso)) {
      tempDoc.settings = {
        ...tempDoc.settings,
        defaultsAssignedDates: [...tempDoc.settings.defaultsAssignedDates, iso],
      };
    }
  }

  function addLocationPreset(locName: string) {
    tempDoc.locationPresets = [...tempDoc.locationPresets, locName];
    if (!tempDoc.locationPresetsV2) tempDoc.locationPresetsV2 = [];
    tempDoc.locationPresetsV2 = [...tempDoc.locationPresetsV2, { name: locName }];
  }
  function removeLocationPreset(locName: string) {
    tempDoc.locationPresets = tempDoc.locationPresets.filter((p) => p !== locName);
    if (tempDoc.locationPresetsV2) {
      tempDoc.locationPresetsV2 = tempDoc.locationPresetsV2.filter((p) => p.name !== locName);
    }
    if (tempDoc.settings.defaultLocation === locName) {
      tempDoc.settings = { ...tempDoc.settings, defaultLocation: "" };
    }
  }
  function updateLocationPreset(locName: string, patch: { color?: string; shape?: string }) {
    if (!tempDoc.locationPresetsV2) tempDoc.locationPresetsV2 = [];
    const idx = tempDoc.locationPresetsV2.findIndex((p) => p.name === locName);
    if (idx >= 0) {
      tempDoc.locationPresetsV2 = tempDoc.locationPresetsV2.map((p) =>
        p.name === locName ? { ...p, ...patch } : p,
      );
    } else {
      tempDoc.locationPresetsV2 = [...tempDoc.locationPresetsV2, { name: locName, ...patch }];
    }
  }
  function reorderEventType(id: string, dir: "up" | "down") {
    const idx = tempDoc.eventTypes.findIndex((t) => t.id === id);
    if (idx < 0) return;
    const swap = dir === "up" ? idx - 1 : idx + 1;
    if (swap < 0 || swap >= tempDoc.eventTypes.length) return;
    const next = [...tempDoc.eventTypes];
    [next[idx]!, next[swap]!] = [next[swap]!, next[idx]!];
    tempDoc.eventTypes = next;
  }
  function reorderLocationPreset(name: string, dir: "up" | "down") {
    const idx = tempDoc.locationPresets.indexOf(name);
    if (idx < 0) return;
    const swap = dir === "up" ? idx - 1 : idx + 1;
    if (swap < 0 || swap >= tempDoc.locationPresets.length) return;
    const next = [...tempDoc.locationPresets];
    [next[idx]!, next[swap]!] = [next[swap]!, next[idx]!];
    tempDoc.locationPresets = next;
  }

  function convertGroups(mode: "collapse" | "expand") {
    // No-op for new shows (no groups yet)
  }

  // ---- Cast callbacks ----
  function addCastMember(member: CastMember) {
    tempDoc.cast = [...tempDoc.cast, member];
  }
  function updateCastMember(id: string, patch: Partial<CastMember>) {
    tempDoc.cast = tempDoc.cast.map((m) => (m.id === id ? { ...m, ...patch } : m));
  }
  function removeCastMember(id: string) {
    tempDoc.cast = tempDoc.cast.filter((m) => m.id !== id);
  }
  function reorderCastMember(id: string, dir: "up" | "down") {
    const idx = tempDoc.cast.findIndex((m) => m.id === id);
    if (idx < 0) return;
    const swap = dir === "up" ? idx - 1 : idx + 1;
    if (swap < 0 || swap >= tempDoc.cast.length) return;
    const next = [...tempDoc.cast];
    [next[idx]!, next[swap]!] = [next[swap]!, next[idx]!];
    tempDoc.cast = next;
  }
  function importCast(added: CastMember[], updates: { id: string; patch: Partial<CastMember> }[]) {
    let cast = [...tempDoc.cast];
    for (const u of updates) {
      cast = cast.map((m) => (m.id === u.id ? { ...m, ...u.patch } : m));
    }
    tempDoc.cast = [...cast, ...added];
  }

  // ---- Crew callbacks ----
  function addCrewMember(member: CrewMember) {
    tempDoc.crew = [...tempDoc.crew, member];
  }
  function updateCrewMember(id: string, patch: Partial<CrewMember>) {
    tempDoc.crew = tempDoc.crew.map((m) => (m.id === id ? { ...m, ...patch } : m));
  }
  function removeCrewMember(id: string) {
    tempDoc.crew = tempDoc.crew.filter((m) => m.id !== id);
  }
  function reorderCrewMember(id: string, dir: "up" | "down") {
    const idx = tempDoc.crew.findIndex((m) => m.id === id);
    if (idx < 0) return;
    const swap = dir === "up" ? idx - 1 : idx + 1;
    if (swap < 0 || swap >= tempDoc.crew.length) return;
    const next = [...tempDoc.crew];
    [next[idx]!, next[swap]!] = [next[swap]!, next[idx]!];
    tempDoc.crew = next;
  }
  function importCrew(added: CrewMember[], updates: { id: string; patch: Partial<CrewMember> }[]) {
    let crew = [...tempDoc.crew];
    for (const u of updates) {
      crew = crew.map((m) => (m.id === u.id ? { ...m, ...u.patch } : m));
    }
    tempDoc.crew = [...crew, ...added];
  }

  // ---- Conflict callbacks ----
  function addConflict(conflict: Conflict) {
    tempDoc.conflicts = [...tempDoc.conflicts, conflict];
  }
  function removeConflict(id: string) {
    tempDoc.conflicts = tempDoc.conflicts.filter((c) => c.id !== id);
  }
</script>

<svelte:window onkeydown={handleKey} />

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="backdrop" onclick={onclose}></div>

<div class="modal" class:expanded={showSettings} role="dialog" aria-labelledby="new-show-title">
  <div class="modal-header">
    <h2 id="new-show-title">New show</h2>
    <button type="button" class="close-btn" aria-label="Close" onclick={onclose}>&times;</button>
  </div>

  <div class="modal-scroll">
    <form class="modal-body" onsubmit={handleSubmit} novalidate>
      <div class="field">
        <label for="show-name">Show name</label>
        <input
          id="show-name"
          type="text"
          bind:value={name}
          placeholder=""
          autocomplete="off"
        />
      </div>

      <div class="field-row">
        <div class="field">
          <label for="show-start">Start date</label>
          <input
            id="show-start"
            type="date"
            bind:value={startDate}
          />
        </div>
        <div class="field">
          <label for="show-end">End date</label>
          <input
            id="show-end"
            type="date"
            bind:value={endDate}
            min={startDate || undefined}
          />
        </div>
      </div>

      {#if error}
        <p class="error-msg">{error}</p>
      {/if}

      <!-- Settings toggle - requires dates so holidays can show the right range -->
      <button
        type="button"
        class="settings-toggle"
        class:disabled={!hasDates}
        disabled={!hasDates}
        onclick={() => (showSettings = !showSettings)}
      >
        <svg
          width="14" height="14" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" stroke-width="2" stroke-linecap="round"
          class:rotated={showSettings}
          aria-hidden="true"
        >
          <path d="M9 18l6-6-6-6" />
        </svg>
        Configure settings
        <span class="settings-hint">{hasDates ? "(optional)" : "(set dates first)"}</span>
      </button>

      {#if showSettings}
        <div class="settings-embed">
          <DefaultsModal
            show={tempDoc}
            embedded={true}
            hideShowTab={true}
            onchange={updateSettings}
            onaddlocationpreset={addLocationPreset}
            onremovelocationpreset={removeLocationPreset}
            onupdatelocationpreset={updateLocationPreset}
            onreorderlocationpreset={reorderLocationPreset}
            onaddeventtype={addEventType}
            onupdateeventtype={updateEventType}
            onremoveeventtype={removeEventType}
            onreordereventtype={reorderEventType}
            onassigneventtype={assignEventType}
            onclose={() => {}}
            onconvertgroups={convertGroups}
            onupdateshow={updateShow}
            onaddmember={addCastMember}
            onupdatemember={updateCastMember}
            onremovemember={removeCastMember}
            onreordermember={reorderCastMember}
            onaddconflict={addConflict}
            onremoveconflict={removeConflict}
            onaddcrew={addCrewMember}
            onupdatecrew={updateCrewMember}
            onremovecrew={removeCrewMember}
            onreordercrew={reorderCrewMember}
            onimportcast={importCast}
            onimportcrew={importCrew}
          />
        </div>
      {/if}

      <div class="actions">
        <button type="button" class="ghost-btn" onclick={onclose}>Cancel</button>
        <button type="submit" class="primary-btn">Create show</button>
      </div>
    </form>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(45, 31, 61, 0.6);
    z-index: 1000;
  }

  .modal {
    position: fixed;
    top: 5vh;
    left: 50%;
    transform: translateX(-50%);
    width: 440px;
    max-width: calc(100vw - 2 * var(--space-4));
    max-height: calc(100vh - 2 * var(--space-4));
    background: var(--color-surface);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-lg);
    z-index: 1010;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    transition: width 200ms ease;
  }

  .modal.expanded {
    width: 720px;
  }

  .modal-scroll {
    overflow-y: auto;
    flex: 1;
    min-height: 0;
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-4) var(--space-5);
    border-bottom: 1px solid var(--color-border);
    flex-shrink: 0;
  }
  .modal-header h2 {
    font-size: 1rem;
    font-weight: 700;
    margin: 0;
    color: var(--color-text);
  }

  .close-btn {
    background: transparent;
    border: none;
    font-size: 1.5rem;
    color: var(--color-text-muted);
    cursor: pointer;
    padding: 0;
    line-height: 1;
  }
  .close-btn:hover {
    color: var(--color-text);
  }

  .modal-body {
    padding: var(--space-4) var(--space-5) var(--space-5);
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    margin-bottom: var(--space-3);
    flex: 1;
  }
  .field label {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--color-text);
  }
  .field input {
    font: inherit;
    font-size: 0.875rem;
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: var(--color-surface);
    color: var(--color-text);
  }
  .field input:focus {
    outline: 2px solid var(--color-plum);
    outline-offset: 1px;
    border-color: var(--color-plum);
  }

  .field-row {
    display: flex;
    gap: var(--space-3);
  }

  .error-msg {
    font-size: 0.8125rem;
    color: var(--color-danger);
    margin: 0 0 var(--space-3);
  }

  .settings-toggle {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font: inherit;
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--color-teal-dark);
    background: none;
    border: none;
    cursor: pointer;
    padding: var(--space-2) 0;
    margin-bottom: var(--space-2);
  }
  .settings-toggle:hover {
    color: var(--color-teal);
  }
  .settings-toggle svg {
    transition: transform 150ms ease;
  }
  .settings-toggle svg.rotated {
    transform: rotate(90deg);
  }
  .settings-hint {
    font-weight: 400;
    color: var(--color-text-muted);
  }

  .settings-embed {
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    margin-bottom: var(--space-4);
    overflow: hidden;
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2);
    margin-top: var(--space-4);
  }

  .ghost-btn {
    font: inherit;
    font-size: 0.8125rem;
    padding: var(--space-2) var(--space-4);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--color-text-muted);
    cursor: pointer;
  }
  .ghost-btn:hover {
    color: var(--color-text);
    border-color: var(--color-text-muted);
  }

  .primary-btn {
    font: inherit;
    font-size: 0.8125rem;
    font-weight: 600;
    padding: var(--space-2) var(--space-4);
    border: none;
    border-radius: var(--radius-sm);
    background: var(--color-plum);
    color: var(--color-text-inverse);
    cursor: pointer;
    transition: background var(--transition-fast);
  }
  .primary-btn:hover {
    background: var(--color-plum-dark);
  }
</style>
