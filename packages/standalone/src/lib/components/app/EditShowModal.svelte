<script lang="ts">
  /**
   * Edit show settings modal. Loads a show from IndexedDB, lets the
   * user modify all settings via embedded DefaultsModal, and saves
   * back to IndexedDB (triggering cloud sync on next editor open).
   */
  import { onMount } from "svelte";
  import type {
    CastMember,
    Conflict,
    CrewMember,
    EventType,
    ScheduleDoc,
    Settings,
    Show,
  } from "@rehearsal-block/core";
  import DefaultsModal from "$lib/components/scheduler/DefaultsModal.svelte";
  import { localLoadShow, localSaveShow } from "$lib/storage/local.js";

  interface Props {
    showId: string;
    onclose: () => void;
    /** Called after saving so the show list can refresh metadata. */
    onsaved?: () => void;
  }

  const { showId, onclose, onsaved }: Props = $props();

  let doc = $state<ScheduleDoc | null>(null);
  let loading = $state(true);
  let saved = $state(false);

  onMount(async () => {
    const show = await localLoadShow(showId);
    if (show) {
      doc = show.document;
    }
    loading = false;
  });

  // Auto-save to IndexedDB on every change (same as the editor).
  // Uses JSON serialization to detect real changes and strip proxies.
  let lastSavedJson = "";
  $effect(() => {
    if (!doc) return;
    const json = JSON.stringify(doc);
    if (lastSavedJson && json !== lastSavedJson) {
      const plain: ScheduleDoc = JSON.parse(json);
      localSaveShow({
        id: showId,
        name: plain.show.name,
        updatedAt: new Date().toISOString(),
        document: plain,
      });
    }
    lastSavedJson = json;
  });

  function handleClose() {
    onsaved?.();
    onclose();
  }

  function handleKey(e: KeyboardEvent) {
    if (e.key === "Escape") handleClose();
  }

  // ---- DefaultsModal callbacks ----

  function updateSettings(patch: Partial<Settings>) {
    if (!doc) return;
    doc.settings = { ...doc.settings, ...patch };
  }

  function updateShow(patch: Partial<Show>) {
    if (!doc) return;
    doc.show = { ...doc.show, ...patch };
  }

  function addEventType(type: EventType) {
    if (!doc) return;
    doc.eventTypes = [...doc.eventTypes, type];
  }
  function updateEventType(id: string, patch: Partial<EventType>) {
    if (!doc) return;
    doc.eventTypes = doc.eventTypes.map((t) => (t.id === id ? { ...t, ...patch } : t));
  }
  function removeEventType(id: string) {
    if (!doc) return;
    doc.eventTypes = doc.eventTypes.filter((t) => t.id !== id);
    if (doc.settings.defaultEventType === id) {
      doc.settings = { ...doc.settings, defaultEventType: "" };
    }
  }
  function reorderEventType(id: string, dir: "up" | "down") {
    if (!doc) return;
    const idx = doc.eventTypes.findIndex((t) => t.id === id);
    if (idx < 0) return;
    const swap = dir === "up" ? idx - 1 : idx + 1;
    if (swap < 0 || swap >= doc.eventTypes.length) return;
    const next = [...doc.eventTypes];
    [next[idx]!, next[swap]!] = [next[swap]!, next[idx]!];
    doc.eventTypes = next;
  }
  function assignEventType(typeId: string, iso: string) {
    if (!doc) return;
    const existing = doc.schedule[iso];
    doc.schedule = {
      ...doc.schedule,
      [iso]: {
        eventTypeId: typeId,
        calls: existing?.calls ?? [],
        description: existing?.description ?? "",
        notes: existing?.notes ?? "",
        location: existing?.location ?? "",
      },
    };
    if (!doc.settings.defaultsAssignedDates.includes(iso)) {
      doc.settings = {
        ...doc.settings,
        defaultsAssignedDates: [...doc.settings.defaultsAssignedDates, iso],
      };
    }
  }

  function addLocationPreset(name: string) {
    if (!doc) return;
    doc.locationPresets = [...doc.locationPresets, name];
    if (!doc.locationPresetsV2) doc.locationPresetsV2 = [];
    doc.locationPresetsV2 = [...doc.locationPresetsV2, { name }];
  }
  function removeLocationPreset(name: string) {
    if (!doc) return;
    doc.locationPresets = doc.locationPresets.filter((p) => p !== name);
    if (doc.locationPresetsV2) {
      doc.locationPresetsV2 = doc.locationPresetsV2.filter((p) => p.name !== name);
    }
    if (doc.settings.defaultLocation === name) {
      doc.settings = { ...doc.settings, defaultLocation: "" };
    }
  }
  function updateLocationPreset(name: string, patch: { color?: string; shape?: string }) {
    if (!doc) return;
    if (!doc.locationPresetsV2) doc.locationPresetsV2 = [];
    const idx = doc.locationPresetsV2.findIndex((p) => p.name === name);
    if (idx >= 0) {
      doc.locationPresetsV2 = doc.locationPresetsV2.map((p) =>
        p.name === name ? { ...p, ...patch } : p,
      );
    } else {
      doc.locationPresetsV2 = [...doc.locationPresetsV2, { name, ...patch }];
    }
  }
  function reorderLocationPreset(name: string, dir: "up" | "down") {
    if (!doc) return;
    const idx = doc.locationPresets.indexOf(name);
    if (idx < 0) return;
    const swap = dir === "up" ? idx - 1 : idx + 1;
    if (swap < 0 || swap >= doc.locationPresets.length) return;
    const next = [...doc.locationPresets];
    [next[idx]!, next[swap]!] = [next[swap]!, next[idx]!];
    doc.locationPresets = next;
  }

  function convertGroups(mode: "collapse" | "expand") {
    // Would need group logic - no-op for now
  }

  function addCastMember(member: CastMember) {
    if (!doc) return;
    doc.cast = [...doc.cast, member];
  }
  function updateCastMember(id: string, patch: Partial<CastMember>) {
    if (!doc) return;
    doc.cast = doc.cast.map((m) => (m.id === id ? { ...m, ...patch } : m));
  }
  function removeCastMember(id: string) {
    if (!doc) return;
    doc.cast = doc.cast.filter((m) => m.id !== id);
  }
  function reorderCastMember(id: string, dir: "up" | "down") {
    if (!doc) return;
    const idx = doc.cast.findIndex((m) => m.id === id);
    if (idx < 0) return;
    const swap = dir === "up" ? idx - 1 : idx + 1;
    if (swap < 0 || swap >= doc.cast.length) return;
    const next = [...doc.cast];
    [next[idx]!, next[swap]!] = [next[swap]!, next[idx]!];
    doc.cast = next;
  }
  function importCast(added: CastMember[], updates: { id: string; patch: Partial<CastMember> }[]) {
    if (!doc) return;
    let cast = [...doc.cast];
    for (const u of updates) {
      cast = cast.map((m) => (m.id === u.id ? { ...m, ...u.patch } : m));
    }
    doc.cast = [...cast, ...added];
  }

  function addCrewMember(member: CrewMember) {
    if (!doc) return;
    doc.crew = [...doc.crew, member];
  }
  function updateCrewMember(id: string, patch: Partial<CrewMember>) {
    if (!doc) return;
    doc.crew = doc.crew.map((m) => (m.id === id ? { ...m, ...patch } : m));
  }
  function removeCrewMember(id: string) {
    if (!doc) return;
    doc.crew = doc.crew.filter((m) => m.id !== id);
  }
  function reorderCrewMember(id: string, dir: "up" | "down") {
    if (!doc) return;
    const idx = doc.crew.findIndex((m) => m.id === id);
    if (idx < 0) return;
    const swap = dir === "up" ? idx - 1 : idx + 1;
    if (swap < 0 || swap >= doc.crew.length) return;
    const next = [...doc.crew];
    [next[idx]!, next[swap]!] = [next[swap]!, next[idx]!];
    doc.crew = next;
  }
  function importCrew(added: CrewMember[], updates: { id: string; patch: Partial<CrewMember> }[]) {
    if (!doc) return;
    let crew = [...doc.crew];
    for (const u of updates) {
      crew = crew.map((m) => (m.id === u.id ? { ...m, ...u.patch } : m));
    }
    doc.crew = [...crew, ...added];
  }

  function addConflict(conflict: Conflict) {
    if (!doc) return;
    doc.conflicts = [...doc.conflicts, conflict];
  }
  function removeConflict(id: string) {
    if (!doc) return;
    doc.conflicts = doc.conflicts.filter((c) => c.id !== id);
  }
</script>

<svelte:window onkeydown={handleKey} />

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="backdrop" onclick={handleClose}></div>

<div class="modal" role="dialog" aria-labelledby="edit-show-title">
  <div class="modal-header">
    <div>
      <div class="eyebrow">Settings</div>
      <h2 id="edit-show-title">{doc?.show.name ?? "Show Settings"}</h2>
    </div>
    <button type="button" class="close-btn" aria-label="Close" onclick={handleClose}>&times;</button>
  </div>

  {#if loading}
    <div class="loading-state">Loading...</div>
  {:else if !doc}
    <div class="loading-state">Show not found in local storage.</div>
  {:else}
    <div class="settings-embed">
      <DefaultsModal
        show={doc}
        embedded={true}
        hideShowTab={false}
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

  <div class="modal-footer">
    <button type="button" class="primary-btn" onclick={handleClose}>Done</button>
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
    width: 720px;
    max-width: calc(100vw - 2 * var(--space-4));
    max-height: calc(100vh - 2 * var(--space-4));
    background: var(--color-surface);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-lg);
    z-index: 1010;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .modal-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    padding: var(--space-4) var(--space-5);
    border-bottom: 1px solid var(--color-border);
    flex-shrink: 0;
  }
  .eyebrow {
    font-size: 0.625rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--color-teal);
    margin-bottom: 2px;
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

  .settings-embed {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
  }

  .loading-state {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 200px;
    color: var(--color-text-muted);
  }

  .modal-footer {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: var(--space-2);
    padding: var(--space-3) var(--space-5);
    border-top: 1px solid var(--color-border);
    flex-shrink: 0;
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
    min-width: 80px;
  }
  .primary-btn:hover {
    background: var(--color-plum-dark);
  }
</style>
