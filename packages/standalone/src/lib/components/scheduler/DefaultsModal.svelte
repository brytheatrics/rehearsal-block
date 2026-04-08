<script lang="ts">
  /**
   * Show-wide defaults editor. Covers:
   *   1. Per-weekday call times - a director's standard rehearsal schedule
   *      (e.g. Mon–Fri 7–9:30pm, Sat 10am–2pm, Sun dark) applied to new
   *      days on that weekday.
   *   2. Location presets - add/remove preset names and mark one as the
   *      show-wide default so new days inherit it unless overridden.
   *
   * Opens as a centered modal dialog so global config doesn't live next
   * to per-day editing. Closes via backdrop click, Escape, or the Done
   * button.
   *
   * Controlled: receives current `settings` + `locationPresets`, emits
   * granular patches the parent applies to the doc. Keeps this component
   * reusable between /demo and /app.
   */
  import type {
    EventType,
    ScheduleDoc,
    Settings,
    Show,
    WeekdayDefault,
  } from "@rehearsal-block/core";
  import {
    EVENT_TYPE_COLOR_PALETTE,
    LOCATION_COLOR_PALETTE,
    LOCATION_SHAPES,
    locationColor,
    locationShape,
    effectiveLocationColor,
    effectiveLocationShape,
    findLocationPreset,
  } from "@rehearsal-block/core";
  import MiniCalendarPicker from "./MiniCalendarPicker.svelte";
  import TimePicker from "./TimePicker.svelte";

  interface Props {
    show: ScheduleDoc;
    onchange: (patch: Partial<Settings>) => void;
    onaddlocationpreset: (name: string) => void;
    onremovelocationpreset: (name: string) => void;
    onaddeventtype: (type: EventType) => void;
    onupdateeventtype: (id: string, patch: Partial<EventType>) => void;
    onremoveeventtype: (id: string) => void;
    onassigneventtype: (typeId: string, iso: string) => void;
    onclose: () => void;
    onconvertgroups?: (mode: "collapse" | "expand") => void;
    onupdatelocationpreset?: (name: string, patch: { color?: string; shape?: string }) => void;
    onupdateshow?: (patch: Partial<Show>) => void;
    /** When true, show name and dates are read-only (demo mode). */
    showReadOnly?: boolean;
  }

  const {
    show,
    onchange,
    onaddlocationpreset,
    onremovelocationpreset,
    onaddeventtype,
    onupdateeventtype,
    onremoveeventtype,
    onassigneventtype,
    onclose,
    onconvertgroups,
    onupdatelocationpreset,
    onupdateshow,
    showReadOnly = false,
  }: Props = $props();

  /** Which event type's color popover is open, if any. */
  let etColorPopoverFor = $state<string | null>(null);
  /** Which location's customizer is expanded. */
  let locCustomizeFor = $state<string | null>(null);

  const availableShapes = LOCATION_SHAPES;

  /** Which event type's mini-calendar popover is open, if any. */
  let calendarForTypeId = $state<string | null>(null);
  const calendarType = $derived(
    calendarForTypeId
      ? (show.eventTypes.find((t) => t.id === calendarForTypeId) ?? null)
      : null,
  );

  function addEventType() {
    const fallback = EVENT_TYPE_COLOR_PALETTE[0]!;
    onaddeventtype({
      id: `et_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      name: "New type",
      bgColor: fallback.bgColor,
      textColor: fallback.textColor,
      isDressPerf: false,
    });
  }

  /** How many scheduled days currently reference a given event type. */
  function usageCount(id: string): number {
    let n = 0;
    for (const day of Object.values(show.schedule)) {
      if (day.eventTypeId === id) n++;
    }
    return n;
  }

  const fontOptions = [
    "Inter",
    "System UI",
    "Roboto",
    "Open Sans",
    "Lato",
    "Century Gothic",
    "Playfair Display",
    "Georgia",
    "Merriweather",
    "Garamond",
  ] as const;

  function applyFontToAll(font: string) {
    onchange({ fontFamily: font, fontHeading: font, fontTime: font, fontNotes: font });
  }

  const incrementOptions = [5, 10, 15, 30, 60] as const;
  const callWindowOptions = [
    { value: 60, label: "1 hour" },
    { value: 90, label: "1.5 hours" },
    { value: 120, label: "2 hours" },
    { value: 150, label: "2.5 hours" },
    { value: 180, label: "3 hours" },
    { value: 240, label: "4 hours" },
  ] as const;

  const weekdayLabels = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];

  const weekdayDefaults = $derived<WeekdayDefault[]>(
    show.settings.weekdayDefaults ??
      Array.from({ length: 7 }, () => ({
        enabled: false,
        startTime: "19:00",
        endTime: "21:30",
      })),
  );

  function patchWeekday(index: number, patch: Partial<WeekdayDefault>) {
    const next = weekdayDefaults.map((w, i) =>
      i === index ? { ...w, ...patch } : w,
    );
    onchange({ weekdayDefaults: next });
  }

  function setDefaultLocation(name: string) {
    onchange({
      defaultLocation: show.settings.defaultLocation === name ? "" : name,
    });
  }

  // Add-location inline input state
  let addingLocation = $state(false);
  let newLocationName = $state("");
  let newLocInput = $state<HTMLInputElement | null>(null);

  function startAddLocation() {
    addingLocation = true;
    newLocationName = "";
    queueMicrotask(() => newLocInput?.focus());
  }

  function cancelAddLocation() {
    addingLocation = false;
    newLocationName = "";
  }

  function commitAddLocation() {
    const trimmed = newLocationName.trim();
    if (!trimmed) {
      cancelAddLocation();
      return;
    }
    const existing = show.locationPresets.find(
      (p) => p.toLowerCase() === trimmed.toLowerCase(),
    );
    if (!existing) onaddlocationpreset(trimmed);
    addingLocation = false;
    newLocationName = "";
  }

  function onAddLocKey(e: KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      commitAddLocation();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancelAddLocation();
    }
  }

  type Tab = "appearance" | "schedule" | "event-types" | "locations" | "show";
  let activeTab = $state<Tab>("appearance");

  function onBackdropKey(e: KeyboardEvent) {
    if (e.key === "Escape") onclose();
  }
</script>

<svelte:window onkeydown={onBackdropKey} />

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="backdrop" onclick={onclose}></div>

<div
  class="modal"
  role="dialog"
  aria-modal="true"
  aria-label="Show defaults"
>
  <header class="modal-header">
    <div class="header-top">
      <div>
        <div class="eyebrow">Defaults</div>
        <h2>Show-wide settings</h2>
      </div>
      <button type="button" class="close" onclick={onclose} aria-label="Close">
        ×
      </button>
    </div>

    <!-- svelte-ignore a11y_no_noninteractive_element_to_interactive_role -->
    <nav class="tab-nav" role="tablist">
      {#each [
        { id: "appearance", label: "Appearance" },
        { id: "schedule", label: "Schedule" },
        { id: "event-types", label: "Event Types" },
        { id: "locations", label: "Locations" },
        { id: "show", label: "Show" },
      ] as tab (tab.id)}
        <button
          type="button"
          class="tab-btn"
          class:active={activeTab === tab.id}
          role="tab"
          aria-selected={activeTab === tab.id}
          onclick={() => (activeTab = tab.id as Tab)}
        >
          {tab.label}
        </button>
      {/each}
    </nav>
  </header>

  <div class="modal-body">
    <!-- ==================== APPEARANCE TAB ==================== -->
    {#if activeTab === "appearance"}

    <section class="section">
      <div class="section-header">
        <h3>Fonts</h3>
        <p class="hint">
          Controls what prints on the exported schedule. The UI stays in its own font.
        </p>
      </div>
      <div class="font-grid">
        <div class="font-row">
          <label class="font-label" for="font-all">Apply to all</label>
          <select
            id="font-all"
            class="font-select"
            value=""
            onchange={(e) => {
              const v = e.currentTarget.value;
              if (v) applyFontToAll(v);
              e.currentTarget.value = "";
            }}
          >
            <option value="" disabled>Choose font...</option>
            {#each fontOptions as f (f)}
              <option value={f} style:font-family={f}>{f}</option>
            {/each}
          </select>
        </div>
        <div class="font-row">
          <label class="font-label" for="font-main">Main</label>
          <select
            id="font-main"
            class="font-select"
            style:font-family={show.settings.fontFamily ?? "Inter"}
            value={show.settings.fontFamily ?? "Inter"}
            onchange={(e) => onchange({ fontFamily: e.currentTarget.value })}
          >
            {#each fontOptions as f (f)}
              <option value={f} style:font-family={f}>{f}</option>
            {/each}
          </select>
        </div>
        <div class="font-row">
          <label class="font-label" for="font-heading">Headings</label>
          <select
            id="font-heading"
            class="font-select"
            style:font-family={show.settings.fontHeading ?? "Playfair Display"}
            value={show.settings.fontHeading ?? "Playfair Display"}
            onchange={(e) => onchange({ fontHeading: e.currentTarget.value })}
          >
            {#each fontOptions as f (f)}
              <option value={f} style:font-family={f}>{f}</option>
            {/each}
          </select>
        </div>
        <div class="font-row">
          <label class="font-label" for="font-time">Times</label>
          <select
            id="font-time"
            class="font-select"
            style:font-family={show.settings.fontTime ?? "Inter"}
            value={show.settings.fontTime ?? "Inter"}
            onchange={(e) => onchange({ fontTime: e.currentTarget.value })}
          >
            {#each fontOptions as f (f)}
              <option value={f} style:font-family={f}>{f}</option>
            {/each}
          </select>
        </div>
        <div class="font-row">
          <label class="font-label" for="font-notes">Notes</label>
          <select
            id="font-notes"
            class="font-select"
            style:font-family={show.settings.fontNotes ?? "Inter"}
            value={show.settings.fontNotes ?? "Inter"}
            onchange={(e) => onchange({ fontNotes: e.currentTarget.value })}
          >
            {#each fontOptions as f (f)}
              <option value={f} style:font-family={f}>{f}</option>
            {/each}
          </select>
        </div>
      </div>
    </section>

    <section class="section">
      <div class="section-header">
        <h3>Font sizes</h3>
        <p class="hint">Control the size of each element in the calendar cells.</p>
      </div>
      <div class="size-grid">
        {#each [
          { key: "sizeEventType", label: "Event type" },
          { key: "sizeTime", label: "Time" },
          { key: "sizeDescription", label: "Description" },
          { key: "sizeCastBadge", label: "Cast" },
          { key: "sizeGroupBadge", label: "Group" },
          { key: "sizeNotes", label: "Notes" },
          { key: "sizeLocation", label: "Location" },
          { key: "sizeConflicts", label: "Conflicts" },
        ] as item (item.key)}
          <div class="size-row">
            <span class="size-label">{item.label}</span>
            <div class="size-chips">
              {#each [{ value: "sm", label: "S" }, { value: "md", label: "M" }, { value: "lg", label: "L" }] as opt (opt.value)}
                <button
                  type="button"
                  class="size-chip"
                  class:selected={(show.settings[item.key as keyof typeof show.settings] ?? "md") === opt.value}
                  onclick={() => onchange({ [item.key]: opt.value })}
                >
                  {opt.label}
                </button>
              {/each}
            </div>
          </div>
        {/each}
      </div>
    </section>

    <section class="section">
      <div class="section-header">
        <h3>Theme</h3>
      </div>
      <div class="increment-row">
        {#each [{ value: "light", label: "Light" }, { value: "dark", label: "Dark" }] as opt (opt.value)}
          <button
            type="button"
            class="increment-chip"
            class:selected={(show.settings.theme ?? "light") === opt.value}
            onclick={() => onchange({ theme: opt.value as "light" | "dark" })}
          >
            {opt.label}
          </button>
        {/each}
      </div>
    </section>

    <section class="section">
      <div class="section-header">
        <h3>Time format</h3>
      </div>
      <div class="increment-row">
        <button
          type="button"
          class="increment-chip"
          class:selected={(show.settings.timeFormat ?? "12h") === "12h"}
          onclick={() => onchange({ timeFormat: "12h" })}
        >
          7:00 PM
        </button>
        <button
          type="button"
          class="increment-chip"
          class:selected={(show.settings.timeFormat ?? "12h") === "24h"}
          onclick={() => onchange({ timeFormat: "24h" })}
        >
          19:00
        </button>
      </div>
    </section>

    <section class="section">
      <div class="section-header">
        <h3>Week starts on</h3>
      </div>
      <div class="increment-row">
        <button
          type="button"
          class="increment-chip"
          class:selected={(show.settings.weekStartsOn ?? 0) === 0}
          onclick={() => onchange({ weekStartsOn: 0 })}
        >
          Sunday
        </button>
        <button
          type="button"
          class="increment-chip"
          class:selected={(show.settings.weekStartsOn ?? 0) === 1}
          onclick={() => onchange({ weekStartsOn: 1 })}
        >
          Monday
        </button>
      </div>
    </section>

    <!-- ==================== SCHEDULE TAB ==================== -->
    {:else if activeTab === "schedule"}

    <section class="section">
      <div class="section-header">
        <h3>Time picker increments</h3>
        <p class="hint">
          How far apart the options in every time picker are. Pick smaller
          increments if you need finer control over call times.
        </p>
      </div>
      <div class="increment-row">
        {#each incrementOptions as mins (mins)}
          <button
            type="button"
            class="increment-chip"
            class:selected={(show.settings.timeIncrementMinutes ?? 15) === mins}
            onclick={() => onchange({ timeIncrementMinutes: mins })}
          >
            {mins} min
          </button>
        {/each}
      </div>
    </section>

    <section class="section">
      <div class="section-header">
        <h3>Dress/Performance call window</h3>
        <p class="hint">
          How far before curtain to show call time options on dress and
          performance days. For example, "2.5 hours" means a 7:30 PM
          curtain shows call times from 5:00 PM to 7:30 PM.
        </p>
      </div>
      <div class="increment-row">
        {#each callWindowOptions as opt (opt.value)}
          <button
            type="button"
            class="increment-chip"
            class:selected={(show.settings.dressCallWindowMinutes ?? 150) === opt.value}
            onclick={() => onchange({ dressCallWindowMinutes: opt.value })}
          >
            {opt.label}
          </button>
        {/each}
      </div>
    </section>

    <section class="section">
      <div class="section-header">
        <h3>Group drop behavior</h3>
        <p class="hint">
          When you drag a group onto a day, should it add the group as one
          chip or expand into individual actor names?
        </p>
      </div>
      <div class="increment-row">
        <button
          type="button"
          class="increment-chip"
          class:selected={(show.settings.groupDropMode ?? "group") === "group"}
          onclick={() => onchange({ groupDropMode: "group" })}
        >
          Group chip
        </button>
        <button
          type="button"
          class="increment-chip"
          class:selected={(show.settings.groupDropMode ?? "group") === "expand"}
          onclick={() => onchange({ groupDropMode: "expand" })}
        >
          Individual actors
        </button>
      </div>
      <div class="convert-row">
        <button
          type="button"
          class="btn btn-secondary btn-sm"
          onclick={() => onconvertgroups?.("collapse")}
        >
          Collapse actors into groups
        </button>
        <button
          type="button"
          class="btn btn-secondary btn-sm"
          onclick={() => onconvertgroups?.("expand")}
        >
          Expand groups into actors
        </button>
      </div>
    </section>

    <section class="section">
      <div class="section-header">
        <h3>Call times per weekday</h3>
        <p class="hint">
          New days on enabled weekdays pre-fill with these times. Disabled
          weekdays stay dark until you set a time manually.
        </p>
      </div>
      <ul class="weekday-list">
        {#each weekdayDefaults as def, i (i)}
          <li class="weekday-row" class:enabled={def.enabled}>
            <label class="weekday-toggle">
              <input
                type="checkbox"
                checked={def.enabled}
                onchange={(e) =>
                  patchWeekday(i, { enabled: e.currentTarget.checked })}
              />
              <span class="weekday-name">{weekdayLabels[i]}</span>
            </label>
            <div class="weekday-times">
              <TimePicker
                value={def.startTime}
                disabled={!def.enabled}
                compact
                minuteStep={show.settings.timeIncrementMinutes ?? 15}
                timeFormat={show.settings.timeFormat ?? "12h"}
                ariaLabel={`${weekdayLabels[i]} start`}
                onchange={(next) => patchWeekday(i, { startTime: next })}
              />
              <span class="dash">-</span>
              <TimePicker
                value={def.endTime}
                disabled={!def.enabled}
                compact
                minuteStep={show.settings.timeIncrementMinutes ?? 15}
                timeFormat={show.settings.timeFormat ?? "12h"}
                ariaLabel={`${weekdayLabels[i]} end`}
                onchange={(next) => patchWeekday(i, { endTime: next })}
              />
            </div>
          </li>
        {/each}
      </ul>
    </section>

    <!-- ==================== EVENT TYPES TAB ==================== -->
    {:else if activeTab === "event-types"}

    <section class="section">
      <div class="section-header section-header-row">
        <div>
          <h3>Event types</h3>
          <p class="hint">
            Badges applied to each day. Colors match the grid and the
            toolbar pills so the palette stays consistent everywhere.
          </p>
        </div>
        <button type="button" class="ghost-btn" onclick={addEventType}>
          + Add type
        </button>
      </div>
      <ul class="event-type-list">
        {#each show.eventTypes as type (type.id)}
          {@const uses = usageCount(type.id)}
          {@const canRemove = show.eventTypes.length > 1}
          <li class="event-type-card">
            <div class="et-row">
              <div class="et-color-anchor">
                <button
                  type="button"
                  class="et-color-btn"
                  style:background={type.bgColor}
                  style:color={type.textColor}
                  title="Change color"
                  aria-label={`Change color for ${type.name || "event type"}`}
                  onclick={(e) => {
                    e.stopPropagation();
                    etColorPopoverFor = etColorPopoverFor === type.id ? null : type.id;
                  }}
                >
                  A
                </button>
                {#if etColorPopoverFor === type.id}
                  <!-- svelte-ignore a11y_click_events_have_key_events -->
                  <!-- svelte-ignore a11y_no_static_element_interactions -->
                  <div class="et-color-popover" onclick={(e) => e.stopPropagation()}>
                    {#each EVENT_TYPE_COLOR_PALETTE as pair (pair.name)}
                      {@const selected =
                        pair.bgColor === type.bgColor &&
                        pair.textColor === type.textColor}
                      <button
                        type="button"
                        class="et-pop-swatch"
                        class:selected
                        style:background={pair.bgColor}
                        style:color={pair.textColor}
                        aria-label={`${pair.name} color`}
                        title={pair.name}
                        onclick={() => {
                          onupdateeventtype(type.id, {
                            bgColor: pair.bgColor,
                            textColor: pair.textColor,
                          });
                          etColorPopoverFor = null;
                        }}
                      >
                        A
                      </button>
                    {/each}
                  </div>
                {/if}
              </div>
              <input
                type="text"
                class="et-name"
                value={type.name}
                placeholder="Name"
                oninput={(e) =>
                  onupdateeventtype(type.id, { name: e.currentTarget.value })}
              />
              <button
                type="button"
                class="remove-btn"
                disabled={!canRemove}
                aria-label={`Remove ${type.name}`}
                title={canRemove
                  ? uses > 0
                    ? `Remove - ${uses} day${uses === 1 ? "" : "s"} will be reassigned`
                    : "Remove"
                  : "Keep at least one event type"}
                onclick={() => onremoveeventtype(type.id)}
              >
                Remove
              </button>
            </div>

            <div class="et-meta">
              <label class="et-dressperf">
                <input
                  type="checkbox"
                  checked={type.isDressPerf}
                  onchange={(e) =>
                    onupdateeventtype(type.id, {
                      isDressPerf: e.currentTarget.checked,
                    })}
                />
                <span>Dress / Performance</span>
              </label>
              <!-- Sibling of the label so hovering the icon never toggles
                   the checkbox. The native `title` attribute turned out
                   unreliable; this is a CSS-driven hover/focus popover. -->
              <button
                type="button"
                class="info-tip"
                aria-label="What does Dress / Performance do?"
              >
                <span class="info-icon" aria-hidden="true">ⓘ</span>
                <span class="tooltip" role="tooltip">
                  Switches the day editor into performance mode: lets you add
                  a curtain time plus multiple labeled call times (Crew Call,
                  Actor Call, etc.) instead of the normal single-call layout.
                </span>
              </button>

              <button
                type="button"
                class="cal-btn"
                aria-label={`Assign ${type.name} to dates`}
                title={`Pick which dates are ${type.name}`}
                onclick={() => (calendarForTypeId = type.id)}
              >
                📅
              </button>
            </div>
          </li>
        {/each}
      </ul>
    </section>

    <!-- ==================== LOCATIONS TAB ==================== -->
    {:else if activeTab === "locations"}

    <section class="section">
      <div class="section-header">
        <h3>Locations</h3>
        <p class="hint">
          Star a location to make it the default for new days. Click a name
          to toggle it as default.
        </p>
      </div>
      <label class="shape-toggle">
        <input
          type="checkbox"
          checked={show.settings.showLocationShapes ?? false}
          onchange={(e) => onchange({ showLocationShapes: e.currentTarget.checked })}
        />
        <span>Show location shapes next to call times</span>
      </label>
      <ul class="location-list">
        {#each show.locationPresets as preset (preset)}
          {@const presetV2 = findLocationPreset(preset, show.locationPresetsV2)}
          {@const color = effectiveLocationColor(preset, show.locationPresetsV2) ?? "var(--color-text-muted)"}
          {@const shape = effectiveLocationShape(preset, show.locationPresetsV2)}
          {@const isDefault = show.settings.defaultLocation === preset}
          {@const isExpanded = locCustomizeFor === preset}
          <li class="location-row-wrap">
            <div class="location-row">
              <button
                type="button"
                class="star-btn"
                class:starred={isDefault}
                aria-label={isDefault
                  ? `Unset ${preset} as default`
                  : `Set ${preset} as default`}
                onclick={() => setDefaultLocation(preset)}
              >
                {isDefault ? "★" : "☆"}
              </button>
              <button
                type="button"
                class="swatch"
                style:background={color}
                onclick={() => (locCustomizeFor = isExpanded ? null : preset)}
                title="Customize color and shape"
              >
                {show.settings.showLocationShapes ? shape : ""}
              </button>
              <span class="location-name">{preset}</span>
              <button
                type="button"
                class="remove-btn"
                aria-label={`Remove ${preset}`}
                onclick={() => onremovelocationpreset(preset)}
              >
                Remove
              </button>
            </div>
            {#if isExpanded}
              <div class="loc-customizer">
                <div class="loc-custom-section">
                  <span class="loc-custom-label">Shape</span>
                  <div class="shape-picker">
                    {#each availableShapes as s (s)}
                      <button
                        type="button"
                        class="shape-option"
                        class:selected={shape === s}
                        onclick={() => onupdatelocationpreset?.(preset, { shape: s })}
                      >
                        {s}
                      </button>
                    {/each}
                  </div>
                </div>
                <div class="loc-custom-section">
                  <span class="loc-custom-label">Color</span>
                  <div class="color-picker">
                    {#each LOCATION_COLOR_PALETTE as c (c)}
                      <button
                        type="button"
                        class="color-option"
                        class:selected={color === c}
                        style:background={c}
                        title={c}
                        aria-label={`Color ${c}`}
                        onclick={() => onupdatelocationpreset?.(preset, { color: c })}
                      ></button>
                    {/each}
                  </div>
                </div>
              </div>
            {/if}
          </li>
        {/each}

        {#if addingLocation}
          <li class="location-row">
            <span class="star-btn-placeholder">☆</span>
            <span class="swatch swatch-empty"></span>
            <input
              class="add-location-input"
              bind:this={newLocInput}
              type="text"
              value={newLocationName}
              placeholder="New location"
              oninput={(e) => (newLocationName = e.currentTarget.value)}
              onkeydown={onAddLocKey}
              onblur={commitAddLocation}
            />
          </li>
        {:else}
          <li class="location-row add-row">
            <button type="button" class="add-location-btn" onclick={startAddLocation}>
              + Add location
            </button>
          </li>
        {/if}
      </ul>
    </section>

    {/if}

    <!-- ==================== SHOW TAB ==================== -->
    {#if activeTab === "show"}

    <section class="section">
      <div class="section-header">
        <h3>Show title</h3>
      </div>
      <input
        id="defaults-show-name"
        type="text"
        class="show-info-input"
        value={show.show.name}
        disabled={showReadOnly}
        oninput={(e) => onupdateshow?.({ name: e.currentTarget.value })}
      />
    </section>

    <section class="section">
      <div class="section-header">
        <h3>Dates</h3>
      </div>
      <div class="show-info-dates">
        <div class="show-info-row">
          <label class="show-info-label" for="defaults-start-date">Start date</label>
          <input
            id="defaults-start-date"
            type="date"
            class="show-info-input"
            value={show.show.startDate}
            max={show.show.endDate}
            disabled={showReadOnly}
            onchange={(e) => onupdateshow?.({ startDate: e.currentTarget.value })}
          />
        </div>
        <div class="show-info-row">
          <label class="show-info-label" for="defaults-end-date">End date</label>
          <input
            id="defaults-end-date"
            type="date"
            class="show-info-input"
            value={show.show.endDate}
            min={show.show.startDate}
            disabled={showReadOnly}
            onchange={(e) => onupdateshow?.({ endDate: e.currentTarget.value })}
          />
        </div>
      </div>
      {#if showReadOnly}
        <p class="show-info-hint">Purchase to edit show details.</p>
      {/if}
    </section>

    {/if}
  </div>

  <footer class="modal-footer">
    <button type="button" class="btn btn-primary" onclick={onclose}>Done</button>
  </footer>
</div>

{#if calendarType}
  <MiniCalendarPicker
    {show}
    activeType={calendarType}
    onassign={(iso) => onassigneventtype(calendarType.id, iso)}
    onclose={() => (calendarForTypeId = null)}
  />
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(45, 31, 61, 0.6);
    z-index: 100;
  }

  .modal {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 720px;
    max-width: calc(100vw - 2 * var(--space-4));
    max-height: calc(100vh - 2 * var(--space-4));
    background: var(--color-surface);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-lg);
    z-index: 110;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .modal-header {
    padding: 0;
    border-bottom: 1px solid var(--color-border);
  }

  .header-top {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    padding: var(--space-4) var(--space-5) var(--space-3);
    gap: var(--space-3);
  }


  .show-info-row {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .show-info-dates {
    display: flex;
    gap: var(--space-3);
    margin-top: var(--space-2);
  }

  .show-info-label {
    font-size: 0.6875rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--color-text-muted);
  }

  .show-info-input {
    font: inherit;
    font-size: 0.9375rem;
    padding: var(--space-2);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: var(--color-surface);
    color: var(--color-text);
    width: 100%;
  }

  .show-info-input:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .show-info-input:focus {
    outline: none;
    border-color: var(--color-teal);
  }

  .show-info-hint {
    font-size: 0.75rem;
    color: var(--color-text-muted);
    font-style: italic;
    margin-top: var(--space-2);
  }

  .tab-nav {
    display: flex;
    padding: 0 var(--space-5);
    gap: 0;
  }

  .tab-btn {
    padding: var(--space-2) var(--space-4);
    background: transparent;
    border: none;
    border-bottom: 2px solid transparent;
    font: inherit;
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--color-text-muted);
    cursor: pointer;
    transition:
      color var(--transition-fast),
      border-color var(--transition-fast);
  }
  .tab-btn:hover {
    color: var(--color-plum);
  }
  .tab-btn.active {
    color: var(--color-plum);
    border-bottom-color: var(--color-plum);
  }

  .eyebrow {
    font-size: 0.6875rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--color-text-subtle);
    font-weight: 700;
    margin-bottom: 2px;
  }

  .modal-header h2 {
    font-family: var(--font-display);
    color: var(--color-plum);
    font-size: 1.25rem;
    margin: 0;
  }

  .close {
    background: transparent;
    border: none;
    font-size: 1.5rem;
    cursor: pointer;
    color: var(--color-text-muted);
    line-height: 1;
    padding: 0 var(--space-2);
    border-radius: var(--radius-sm);
  }
  .close:hover {
    color: var(--color-plum);
    background: var(--color-bg-alt);
  }

  .modal-body {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-5);
    display: flex;
    flex-direction: column;
    gap: var(--space-6);
  }

  .section-header {
    margin-bottom: var(--space-3);
  }

  .section h3 {
    font-size: 0.875rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--color-plum);
    margin: 0 0 var(--space-1) 0;
    font-weight: 700;
  }

  .hint {
    font-size: 0.75rem;
    color: var(--color-text-muted);
    margin: 0;
  }

  .weekday-list,
  .location-row-wrap {
    display: flex;
    flex-direction: column;
  }

  .loc-customizer {
    padding: var(--space-2) var(--space-3) var(--space-3);
    margin-left: 2rem;
    border-left: 2px solid var(--color-border);
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .loc-custom-section {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .loc-custom-label {
    font-size: 0.6875rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--color-text-subtle);
    font-weight: 700;
  }

  .shape-picker {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
  }

  .shape-option {
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: var(--color-surface);
    font-size: 0.875rem;
    cursor: pointer;
    transition: all var(--transition-fast);
  }
  .shape-option:hover {
    border-color: var(--color-plum);
  }
  .shape-option.selected {
    border-color: var(--color-plum);
    background: var(--color-plum);
    color: var(--color-text-inverse);
  }

  .color-picker {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
  }

  .color-option {
    width: 22px;
    height: 22px;
    border-radius: 50%;
    border: 2px solid transparent;
    cursor: pointer;
    transition: all var(--transition-fast);
  }
  .color-option:hover {
    border-color: var(--color-text);
  }
  .color-option.selected {
    border-color: var(--color-text);
    box-shadow: 0 0 0 2px var(--color-surface), 0 0 0 4px var(--color-text);
  }

  .shape-toggle {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-size: 0.8125rem;
    color: var(--color-text);
    cursor: pointer;
    margin-bottom: var(--space-3);
  }

  .location-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .weekday-row {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: var(--color-bg-alt);
  }
  .weekday-row.enabled {
    background: var(--color-surface);
    border-color: var(--color-border-strong);
  }

  .weekday-toggle {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex: 1;
    cursor: pointer;
    font-size: 0.875rem;
  }

  .weekday-name {
    font-weight: 600;
    color: var(--color-text);
  }

  .weekday-row:not(.enabled) .weekday-name {
    color: var(--color-text-subtle);
  }

  .weekday-times {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .section-header-row {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-3);
  }

  .ghost-btn {
    background: var(--color-plum);
    color: var(--color-text-inverse);
    border: none;
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-sm);
    font-size: 0.75rem;
    font-weight: 700;
    cursor: pointer;
    flex-shrink: 0;
  }
  .ghost-btn:hover {
    background: var(--color-plum-light);
  }

  .event-type-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .event-type-card {
    background: var(--color-bg-alt);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    padding: var(--space-3);
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .et-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .et-color-anchor {
    position: relative;
    flex-shrink: 0;
  }

  .et-color-btn {
    width: 1.75rem;
    height: 1.75rem;
    border-radius: var(--radius-sm);
    border: 2px solid var(--color-surface);
    box-shadow: 0 0 0 1px var(--color-border-strong);
    cursor: pointer;
    padding: 0;
    font-size: 0.75rem;
    font-weight: 700;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition: box-shadow var(--transition-fast);
  }
  .et-color-btn:hover {
    box-shadow: 0 0 0 2px var(--color-plum);
  }

  .et-color-popover {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    z-index: 120;
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    padding: var(--space-2);
    background: var(--color-surface);
    border: 1px solid var(--color-border-strong);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-lg);
    width: 220px;
  }

  .et-pop-swatch {
    width: 28px;
    height: 28px;
    border-radius: var(--radius-sm);
    border: 2px solid transparent;
    cursor: pointer;
    padding: 0;
    font-size: 0.6875rem;
    font-weight: 700;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition: transform var(--transition-fast);
  }
  .et-pop-swatch:hover {
    transform: scale(1.1);
  }
  .et-pop-swatch.selected {
    border-color: var(--color-plum);
    box-shadow: 0 0 0 2px var(--color-surface), 0 0 0 3px var(--color-plum);
  }

  .et-name {
    font: inherit;
    font-size: 0.875rem;
    font-weight: 600;
    padding: var(--space-1) var(--space-2);
    border: 1px solid var(--color-border-strong);
    border-radius: var(--radius-sm);
    background: var(--color-surface);
    color: var(--color-text);
    flex: 1;
    min-width: 0;
  }

  .et-meta {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0;
  }

  .et-dressperf {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    font-size: 0.75rem;
    color: var(--color-text);
    cursor: pointer;
  }

  .info-tip {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.25rem;
    height: 1.25rem;
    padding: 0;
    background: transparent;
    border: none;
    color: var(--color-text-subtle);
    cursor: help;
    margin-left: var(--space-1);
  }
  .info-tip:hover,
  .info-tip:focus-visible {
    color: var(--color-plum);
  }
  .info-tip:focus-visible {
    outline: 2px solid var(--color-teal);
    outline-offset: 2px;
    border-radius: var(--radius-full);
  }

  .info-icon {
    font-size: 0.875rem;
    line-height: 1;
  }

  .info-tip .tooltip {
    position: absolute;
    bottom: calc(100% + 6px);
    left: 50%;
    transform: translateX(-50%);
    width: 240px;
    padding: var(--space-2) var(--space-3);
    background: var(--color-plum);
    color: var(--color-text-inverse);
    border-radius: var(--radius-md);
    font-size: 0.6875rem;
    font-weight: 500;
    line-height: 1.4;
    text-align: left;
    white-space: normal;
    opacity: 0;
    visibility: hidden;
    pointer-events: none;
    transition:
      opacity 120ms ease,
      visibility 120ms ease;
    z-index: 130;
    box-shadow: var(--shadow-md);
  }
  .info-tip .tooltip::after {
    content: "";
    position: absolute;
    top: 100%;
    left: 50%;
    transform: translateX(-50%);
    border: 5px solid transparent;
    border-top-color: var(--color-plum);
  }
  .info-tip:hover .tooltip,
  .info-tip:focus-visible .tooltip {
    opacity: 1;
    visibility: visible;
  }

  .cal-btn {
    margin-left: auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.75rem;
    height: 1.75rem;
    padding: 0;
    border: 1px solid var(--color-border-strong);
    border-radius: var(--radius-sm);
    background: var(--color-surface);
    font-size: 0.875rem;
    cursor: pointer;
    transition:
      background var(--transition-fast),
      border-color var(--transition-fast);
  }
  .cal-btn:hover {
    background: var(--color-bg-alt);
    border-color: var(--color-plum);
  }

  .increment-row {
    display: flex;
    gap: var(--space-2);
    flex-wrap: wrap;
  }

  .convert-row {
    display: flex;
    gap: var(--space-2);
    margin-top: var(--space-3);
  }

  .btn-sm {
    font-size: 0.75rem;
    padding: var(--space-1) var(--space-3);
  }

  .increment-chip {
    padding: var(--space-1) var(--space-4);
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
  .increment-chip:hover {
    border-color: var(--color-plum);
    color: var(--color-plum);
  }
  .increment-chip.selected {
    background: var(--color-plum);
    color: var(--color-text-inverse);
    border-color: var(--color-plum);
  }

  .size-grid {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .size-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
  }

  .size-label {
    font-size: 0.8125rem;
    font-weight: 500;
    color: var(--color-text);
    min-width: 5rem;
  }

  .size-chips {
    display: flex;
    gap: 2px;
  }

  .size-chip {
    width: 2rem;
    height: 1.75rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font: inherit;
    font-size: 0.6875rem;
    font-weight: 600;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: var(--color-surface);
    color: var(--color-text-muted);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .size-chip:hover {
    border-color: var(--color-plum);
    color: var(--color-plum);
  }

  .size-chip.selected {
    background: var(--color-plum);
    color: var(--color-text-inverse);
    border-color: var(--color-plum);
  }

  .font-grid {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .font-row {
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }

  .font-label {
    font-size: 0.75rem;
    font-weight: 700;
    color: var(--color-text-muted);
    width: 5.5rem;
    flex-shrink: 0;
    text-align: right;
  }

  .font-select {
    flex: 1;
    font: inherit;
    font-size: 0.8125rem;
    padding: var(--space-1) var(--space-2);
    border: 1px solid var(--color-border-strong);
    border-radius: var(--radius-sm);
    background: var(--color-surface);
    color: var(--color-text);
    cursor: pointer;
  }
  .font-select:focus {
    outline: 2px solid var(--color-teal);
    outline-offset: 0;
    border-color: var(--color-teal);
  }

  .dash {
    color: var(--color-text-subtle);
  }

  .location-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: var(--color-surface);
  }

  .star-btn,
  .star-btn-placeholder {
    background: transparent;
    border: none;
    font-size: 1rem;
    cursor: pointer;
    color: var(--color-text-subtle);
    padding: 0;
    width: 1.25rem;
    text-align: center;
  }
  .star-btn:hover {
    color: var(--color-warning);
  }
  .star-btn.starred {
    color: var(--color-warning);
  }

  .swatch {
    width: 10px;
    height: 10px;
    border-radius: var(--radius-full);
    flex-shrink: 0;
  }
  .swatch-empty {
    background: var(--color-border);
  }

  .location-name {
    flex: 1;
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--color-text);
  }

  .remove-btn {
    background: transparent;
    border: none;
    color: var(--color-danger);
    font-size: 0.6875rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    cursor: pointer;
    padding: var(--space-1) var(--space-2);
    border-radius: var(--radius-sm);
  }
  .remove-btn:hover {
    background: var(--color-danger-bg);
  }

  .add-row {
    background: transparent;
    border: 1px dashed var(--color-border-strong);
    justify-content: center;
    padding: 0;
  }

  .add-location-btn {
    width: 100%;
    background: transparent;
    border: none;
    padding: var(--space-2) var(--space-3);
    color: var(--color-text-subtle);
    font-size: 0.8125rem;
    font-weight: 600;
    cursor: pointer;
  }
  .add-location-btn:hover {
    color: var(--color-plum);
  }

  .add-location-input {
    font: inherit;
    font-size: 0.875rem;
    padding: var(--space-1) var(--space-2);
    border: 1px solid var(--color-plum);
    border-radius: var(--radius-sm);
    background: var(--color-surface);
    flex: 1;
  }

  .modal-footer {
    display: flex;
    justify-content: flex-end;
    padding: var(--space-4) var(--space-5);
    border-top: 1px solid var(--color-border);
    background: var(--color-bg-alt);
  }
</style>
