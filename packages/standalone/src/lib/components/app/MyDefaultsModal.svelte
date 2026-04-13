<script lang="ts">
  /**
   * "My Defaults" modal - persistent cross-show settings.
   *
   * Lets users configure their preferred defaults (appearance, schedule,
   * event types, locations) once. Every new show inherits these settings
   * automatically. Saved to IndexedDB so they persist across sessions.
   */
  import { onMount } from "svelte";
  import {
    newEmptyScheduleDoc,
    type EventType,
    type ScheduleDoc,
    type Settings,
    type Show,
  } from "@rehearsal-block/core";
  import DefaultsModal from "$lib/components/scheduler/DefaultsModal.svelte";
  import {
    getUserDefaults,
    saveUserDefaults,
    clearUserDefaults,
    type UserDefaults,
  } from "$lib/storage/local.js";

  interface Props {
    onclose: () => void;
  }

  const { onclose }: Props = $props();

  let tempDoc = $state<ScheduleDoc>(
    newEmptyScheduleDoc({ name: "Defaults Preview", startDate: "2026-01-01", endDate: "2026-03-01" }),
  );
  let saved = $state(false);
  let loaded = $state(false);

  // Blank weekday defaults for first-time My Defaults (all unchecked, no times).
  // Users set their own schedule from scratch rather than inheriting the
  // sample show's Mon-Sat 7-9:30pm pattern.
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
      // First time opening My Defaults - start with blank weekdays
      tempDoc.settings = { ...tempDoc.settings, weekdayDefaults: blankWeekdays };
    }
    loaded = true;
  });

  async function handleSave() {
    // Clone via JSON to strip Svelte 5 reactive proxies before
    // writing to IndexedDB (structuredClone fails on proxies).
    const defaults: UserDefaults = JSON.parse(JSON.stringify({
      settings: tempDoc.settings,
      eventTypes: tempDoc.eventTypes,
      locationPresets: tempDoc.locationPresets,
      locationPresetsV2: tempDoc.locationPresetsV2,
    }));
    await saveUserDefaults(defaults);
    saved = true;
    setTimeout(() => (saved = false), 2000);
  }

  async function handleReset() {
    await clearUserDefaults();
    tempDoc = newEmptyScheduleDoc({ name: "Defaults Preview", startDate: "2026-01-01", endDate: "2026-03-01" });
    tempDoc.settings = { ...tempDoc.settings, weekdayDefaults: blankWeekdays };
    saved = false;
  }

  function handleKey(e: KeyboardEvent) {
    if (e.key === "Escape") onclose();
  }

  // ---- DefaultsModal callbacks ----

  function updateSettings(patch: Partial<Settings>) {
    tempDoc.settings = { ...tempDoc.settings, ...patch };
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
    // No-op for defaults - no real schedule to assign to
  }

  function addLocationPreset(name: string) {
    tempDoc.locationPresets = [...tempDoc.locationPresets, name];
    if (!tempDoc.locationPresetsV2) tempDoc.locationPresetsV2 = [];
    tempDoc.locationPresetsV2 = [...tempDoc.locationPresetsV2, { name }];
  }
  function removeLocationPreset(name: string) {
    tempDoc.locationPresets = tempDoc.locationPresets.filter((p) => p !== name);
    if (tempDoc.locationPresetsV2) {
      tempDoc.locationPresetsV2 = tempDoc.locationPresetsV2.filter((p) => p.name !== name);
    }
    if (tempDoc.settings.defaultLocation === name) {
      tempDoc.settings = { ...tempDoc.settings, defaultLocation: "" };
    }
  }
  function updateLocationPreset(name: string, patch: { color?: string; shape?: string }) {
    if (!tempDoc.locationPresetsV2) tempDoc.locationPresetsV2 = [];
    const idx = tempDoc.locationPresetsV2.findIndex((p) => p.name === name);
    if (idx >= 0) {
      tempDoc.locationPresetsV2 = tempDoc.locationPresetsV2.map((p) =>
        p.name === name ? { ...p, ...patch } : p,
      );
    } else {
      tempDoc.locationPresetsV2 = [...tempDoc.locationPresetsV2, { name, ...patch }];
    }
  }
</script>

<svelte:window onkeydown={handleKey} />

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="backdrop" onclick={onclose}></div>

<div class="modal" role="dialog" aria-labelledby="defaults-title">
  <div class="modal-header">
    <div>
      <div class="eyebrow">Preferences</div>
      <h2 id="defaults-title">My Defaults</h2>
    </div>
    <button type="button" class="close-btn" aria-label="Close" onclick={onclose}>&times;</button>
  </div>

  <p class="hint">
    These settings apply to every new show you create. You can still override them per-show.
  </p>

  {#if loaded}
    <div class="settings-embed">
      <DefaultsModal
        show={tempDoc}
        embedded={true}
        hideShowTab={true}
        hideContactsTab={true}
        onchange={updateSettings}
        onaddlocationpreset={addLocationPreset}
        onremovelocationpreset={removeLocationPreset}
        onupdatelocationpreset={updateLocationPreset}
        onaddeventtype={addEventType}
        onupdateeventtype={updateEventType}
        onremoveeventtype={removeEventType}
        onassigneventtype={assignEventType}
        onclose={() => {}}
      />
    </div>
  {/if}

  <div class="modal-footer">
    <button type="button" class="reset-btn" onclick={handleReset}>
      Reset to factory defaults
    </button>
    <div class="footer-right">
      <button type="button" class="ghost-btn" onclick={onclose}>Cancel</button>
      <button type="button" class="primary-btn" onclick={handleSave}>
        {saved ? "Saved!" : "Save defaults"}
      </button>
    </div>
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

  .hint {
    font-size: 0.8125rem;
    color: var(--color-text-muted);
    padding: var(--space-3) var(--space-5) 0;
    margin: 0;
    flex-shrink: 0;
  }

  .settings-embed {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    border-top: 1px solid var(--color-border);
    margin-top: var(--space-3);
  }

  .modal-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-3) var(--space-5);
    border-top: 1px solid var(--color-border);
    flex-shrink: 0;
  }

  .footer-right {
    display: flex;
    gap: var(--space-2);
  }

  .reset-btn {
    font: inherit;
    font-size: 0.75rem;
    color: var(--color-text-muted);
    background: none;
    border: none;
    cursor: pointer;
    text-decoration: underline;
    text-underline-offset: 2px;
    padding: 0;
  }
  .reset-btn:hover {
    color: var(--color-danger);
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
    min-width: 120px;
  }
  .primary-btn:hover {
    background: var(--color-plum-dark);
  }
</style>
