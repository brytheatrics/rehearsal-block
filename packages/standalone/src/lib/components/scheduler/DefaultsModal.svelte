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
    CastMember,
    Conflict,
    CrewMember,
    EventType,
    ScheduleDoc,
    Settings,
    Show,
    WeekdayDefault,
  } from "@rehearsal-block/core";
  import {
    CAST_COLOR_PALETTE,
    formatPhone,
    formatTime,
    holidaysInRange,
    parseCsvText,
    autoMapColumns,
    autoMapCrewColumns,
    mapRowsToCast,
    mapRowsToCrew,
    mergeCastImport,
    mergeCrewImport,
    CAST_FIELD_LABELS,
    CREW_FIELD_LABELS,
  } from "@rehearsal-block/core";
  import type { CastField, CrewField, ImportMode, ImportResult, CsvParseResult } from "@rehearsal-block/core";
  import ActorConflictPicker from "./ActorConflictPicker.svelte";
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
    /** When true, every cast/crew edit action (add, remove, import, rename,
     *  reorder, color) triggers the paywall instead of mutating. */
    contactsLocked?: boolean;
    /** Called when a locked action is attempted. Opens the paywall modal. */
    onpaywall?: () => void;
    /** Cast editing callbacks. */
    onaddmember?: (member: CastMember) => void;
    onupdatemember?: (id: string, patch: Partial<CastMember>) => void;
    onremovemember?: (id: string) => void;
    onreordermember?: (id: string, direction: "up" | "down") => void;
    onaddconflict?: (conflict: Conflict) => void;
    onremoveconflict?: (id: string) => void;
    /** Crew (production team) editing callbacks. */
    onaddcrew?: (member: CrewMember) => void;
    onupdatecrew?: (id: string, patch: Partial<CrewMember>) => void;
    onremovecrew?: (id: string) => void;
    onreordercrew?: (id: string, direction: "up" | "down") => void;
    /** Bulk import cast from CSV. */
    onimportcast?: (added: CastMember[], updates: { id: string; patch: Partial<CastMember> }[]) => void;
    /** Bulk import crew from CSV. */
    onimportcrew?: (added: CrewMember[], updates: { id: string; patch: Partial<CrewMember> }[]) => void;
    /** Open the conflict collection modal (send link to actors). */
    oncollectconflicts?: () => void;
    /** When true, render without backdrop/modal chrome - just tabs + content.
     *  Used when embedded inside another modal (e.g. NewShowModal). */
    embedded?: boolean;
    /** When true, hide the "Show" tab (used when name/dates are in the parent form). */
    hideShowTab?: boolean;
    /** When true, hide the "Contacts" tab (used in My Defaults where cast/crew are per-show). */
    hideContactsTab?: boolean;
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
    onaddmember,
    onupdatemember,
    onremovemember,
    onreordermember,
    onaddconflict,
    onremoveconflict,
    onaddcrew,
    onupdatecrew,
    onremovecrew,
    onreordercrew,
    onimportcast,
    onimportcrew,
    oncollectconflicts,
    contactsLocked = false,
    onpaywall,
    embedded = false,
    hideShowTab = false,
    hideContactsTab = false,
  }: Props = $props();

  /** Trigger the paywall modal from a locked action. Returns true so call
   *  sites can early-return with `if (gate()) return;`. */
  function gate(): boolean {
    onpaywall?.();
    return true;
  }

  /** Capture-phase pointer handler for the Contacts tab sections. When
   *  locked, any click on an editable element (input, mutation button,
   *  color dot, conflict tag) opens the paywall and stops the event
   *  before it reaches the real handler. Allowlisted: card expand
   *  toggle, collapse/expand all, section header actions (those buttons
   *  self-gate through their click handlers). */
  function contactsPointerGuard(e: PointerEvent) {
    if (!contactsLocked) return;
    const target = e.target as HTMLElement;
    if (target.closest(".mockup-card-main")) return;
    if (target.closest(".mockup-toolbar")) return;
    if (target.closest(".section-header-actions")) return;
    if (target.closest(".section-header > div:first-child")) return;
    if (target.closest(".contacts-subtabs")) return;
    e.preventDefault();
    e.stopPropagation();
    gate();
  }

  /** Capture-phase key handler that blocks typing into cast/crew inputs
   *  when locked. Navigation keys (Tab, arrows) still work so the user
   *  can tab through, but any character key opens the paywall. */
  function contactsKeyGuard(e: KeyboardEvent) {
    if (!contactsLocked) return;
    const target = e.target as HTMLElement;
    if (target.tagName !== "INPUT") return;
    const nav = ["Tab", "Escape", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"];
    if (nav.includes(e.key)) return;
    e.preventDefault();
    gate();
  }

  /** Block paste events too (right-click paste bypasses keydown). */
  function contactsPasteGuard(e: ClipboardEvent) {
    if (!contactsLocked) return;
    e.preventDefault();
    gate();
  }

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

  type SizeVal = "xs" | "sm" | "md" | "lg" | "xl";
  const sizeOpts: { value: SizeVal; label: string }[] = [
    { value: "xs", label: "XS" },
    { value: "sm", label: "S" },
    { value: "md", label: "M" },
    { value: "lg", label: "L" },
    { value: "xl", label: "XL" },
  ];

  function applySizeToAll(size: SizeVal) {
    onchange({
      sizeEventType: size,
      sizeTime: size,
      sizeDescription: size,
      sizeCastBadge: size,
      sizeGroupBadge: size,
      sizeNotes: size,
      sizeLocation: size,
      sizeConflicts: size,
    });
  }

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

  function setDefaultEventType(id: string) {
    onchange({
      defaultEventType: (show.settings.defaultEventType ?? "") === id ? "" : id,
    });
  }

  // Holiday state
  let addingHoliday = $state(false);
  let newHolidayDate = $state("");
  let newHolidayName = $state("");

  function addCustomHoliday() {
    if (!newHolidayDate || !newHolidayName.trim()) return;
    const existing = show.settings.customHolidays ?? [];
    onchange({ customHolidays: [...existing, { date: newHolidayDate, name: newHolidayName.trim() }] });
    newHolidayDate = "";
    newHolidayName = "";
    addingHoliday = false;
  }

  function removeCustomHoliday(date: string, name: string) {
    const existing = show.settings.customHolidays ?? [];
    onchange({ customHolidays: existing.filter(h => !(h.date === date && h.name === name)) });
  }

  function toggleHoliday(name: string) {
    const hidden = show.settings.hiddenHolidays ?? [];
    if (hidden.includes(name)) {
      onchange({ hiddenHolidays: hidden.filter(n => n !== name) });
    } else {
      onchange({ hiddenHolidays: [...hidden, name] });
    }
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

  type Tab = "appearance" | "schedule" | "event-types" | "locations" | "contacts" | "show";
  let activeTab = $state<Tab>("appearance");

  // Contacts sub-tabs
  type ContactsSubTab = "cast" | "crew";
  let contactsSubTab = $state<ContactsSubTab>("cast");

  // Auto-focus the contacts section for keyboard shortcuts
  function focusContactsSection() {
    queueMicrotask(() => {
      if (contactsSubTab === "cast") castListEl?.focus();
      else crewListEl?.focus();
    });
  }

  // Cast editing state
  let castColorPopoverFor = $state<string | null>(null);
  let castDeleteConfirmFor = $state<string | null>(null);
  let castConflictPickerFor = $state<string | null>(null);
  let castListEl = $state<HTMLElement | null>(null);

  const castConflictMember = $derived(
    castConflictPickerFor
      ? show.cast.find((m) => m.id === castConflictPickerFor) ?? null
      : null,
  );

  function addCastMember() {
    if (contactsLocked) { gate(); return; }
    const colorIndex = show.cast.length % CAST_COLOR_PALETTE.length;
    const member: CastMember = {
      id: `actor_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      firstName: "",
      lastName: "",
      character: "",
      color: CAST_COLOR_PALETTE[colorIndex] ?? "#424242",
    };
    onaddmember?.(member);
    queueMicrotask(() => {
      const cards = castListEl?.querySelectorAll(".cast-card");
      const last = cards?.[cards.length - 1];
      last?.scrollIntoView({ block: "center", behavior: "auto" });
      const firstInput = last?.querySelector<HTMLInputElement>(".cast-field-first");
      firstInput?.focus();
    });
  }

  function requestCastDelete(id: string) {
    if (contactsLocked) { gate(); return; }
    const calledOnDays = Object.values(show.schedule).some((day) =>
      day.calls.some((c) => c.calledActorIds.includes(id) || c.allCalled),
    );
    if (calledOnDays) {
      castDeleteConfirmFor = id;
      return;
    }
    onremovemember?.(id);
  }

  function castConflictCount(actorId: string): number {
    return show.conflicts.filter((c) => c.actorId === actorId).length;
  }

  function castConflictsFor(actorId: string): Conflict[] {
    return show.conflicts.filter((c) => c.actorId === actorId);
  }

  const timeFmt = $derived(show.settings.timeFormat ?? "12h");

  function conflictLabel(c: Conflict): string {
    if (c.startTime && c.endTime) {
      return `${formatTime(c.startTime, timeFmt)} - ${formatTime(c.endTime, timeFmt)}`;
    }
    return "Full day";
  }

  // Inline conflict edit state
  let editConflictId = $state<string | null>(null);
  let editConflictKind = $state<"all-day" | "timed">("all-day");
  let editConflictStart = $state("");
  let editConflictEnd = $state("");
  let editConflictLabel = $state("");
  /** Which cast members' cards are expanded in the card view. */
  let expandedCast = $state<Set<string>>(new Set());
  /** Which cast member's conflict list is expanded. */
  let expandedConflicts = $state<string | null>(null);

  function castToggle(id: string) {
    const next = new Set(expandedCast);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    expandedCast = next;
  }
  function castExpandAll() { expandedCast = new Set(show.cast.map((m) => m.id)); }
  function castCollapseAll() { expandedCast = new Set(); }

  // CSV import state
  let csvImportParsed = $state<CsvParseResult | null>(null);
  let csvImportMapping = $state<(CastField | null)[]>([]);
  let csvImportMode = $state<ImportMode>("add");
  let csvImportResult = $state<ImportResult | null>(null);
  let csvFileInput = $state<HTMLInputElement | null>(null);

  function handleCsvFile(e: Event) {
    if (contactsLocked) { gate(); return; }
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      const parsed = parseCsvText(text);
      if (parsed.headers.length === 0) return;
      csvImportParsed = parsed;
      csvImportMapping = autoMapColumns(parsed.headers);
      csvImportMode = "add";
      csvImportResult = null;
    };
    reader.readAsText(file);
    // Reset input so the same file can be re-selected
    (e.target as HTMLInputElement).value = "";
  }

  function cancelCsvImport() {
    csvImportParsed = null;
    csvImportMapping = [];
    csvImportResult = null;
  }

  function updateCsvMapping(colIndex: number, value: string) {
    const next = [...csvImportMapping];
    next[colIndex] = value === "" ? null : (value as CastField);
    csvImportMapping = next;
  }

  const csvPreviewRows = $derived.by(() => {
    if (!csvImportParsed) return [];
    return csvImportParsed.rows.slice(0, 5);
  });

  const csvMappedFieldLabels = $derived.by(() => {
    return csvImportMapping.map((f) => (f ? CAST_FIELD_LABELS[f] : "Skip"));
  });

  function executeCsvImport() {
    if (!csvImportParsed) return;
    const incoming = mapRowsToCast(csvImportParsed.rows, csvImportMapping, show.cast.length);
    const result = mergeCastImport(show.cast, incoming, csvImportMode);
    csvImportResult = result;
    onimportcast?.(result.added, result.updated);
    csvImportParsed = null;
  }

  function dismissImportResult() {
    csvImportResult = null;
  }

  // Crew CSV import state
  let crewCsvParsed = $state<CsvParseResult | null>(null);
  let crewCsvMapping = $state<(CrewField | null)[]>([]);
  let crewCsvMode = $state<ImportMode>("add");
  let crewCsvResult = $state<ImportResult<CrewMember> | null>(null);
  let crewCsvFileInput = $state<HTMLInputElement | null>(null);

  function handleCrewCsvFile(e: Event) {
    if (contactsLocked) { gate(); return; }
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      const parsed = parseCsvText(text);
      if (parsed.headers.length === 0) return;
      crewCsvParsed = parsed;
      crewCsvMapping = autoMapCrewColumns(parsed.headers);
      crewCsvMode = "add";
      crewCsvResult = null;
    };
    reader.readAsText(file);
    (e.target as HTMLInputElement).value = "";
  }

  function cancelCrewCsvImport() {
    crewCsvParsed = null;
    crewCsvMapping = [];
    crewCsvResult = null;
  }

  function updateCrewCsvMapping(colIndex: number, value: string) {
    const next = [...crewCsvMapping];
    next[colIndex] = value === "" ? null : (value as CrewField);
    crewCsvMapping = next;
  }

  const crewCsvPreviewRows = $derived.by(() => {
    if (!crewCsvParsed) return [];
    return crewCsvParsed.rows.slice(0, 5);
  });

  function executeCrewCsvImport() {
    if (!crewCsvParsed) return;
    const incoming = mapRowsToCrew(crewCsvParsed.rows, crewCsvMapping, show.crew.length);
    const result = mergeCrewImport(show.crew, incoming, crewCsvMode);
    crewCsvResult = result;
    onimportcrew?.(result.added, result.updated);
    crewCsvParsed = null;
  }

  function dismissCrewImportResult() {
    crewCsvResult = null;
  }

  // Crew editing state
  let crewColorPopoverFor = $state<string | null>(null);
  let crewDeleteConfirmFor = $state<string | null>(null);
  let crewListEl = $state<HTMLElement | null>(null);
  let crewConflictPickerFor = $state<string | null>(null);
  /** Which crew members' cards are expanded. */
  let expandedCrew = $state<Set<string>>(new Set());
  let expandedCrewConflicts = $state<string | null>(null);

  function crewToggle(id: string) {
    const next = new Set(expandedCrew);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    expandedCrew = next;
  }
  function crewExpandAll() { expandedCrew = new Set(show.crew.map((m) => m.id)); }
  function crewCollapseAll() { expandedCrew = new Set(); }

  const crewConflictMember = $derived(
    crewConflictPickerFor
      ? show.crew.find((m) => m.id === crewConflictPickerFor) ?? null
      : null,
  );

  // Convert CrewMember to CastMember shape for the conflict picker
  const crewAscast = $derived.by(() => {
    if (!crewConflictMember) return null;
    return {
      ...crewConflictMember,
      character: crewConflictMember.role,
    } as CastMember;
  });

  function crewConflictCount(id: string): number {
    return show.conflicts.filter((c) => c.actorId === id).length;
  }

  function crewConflictsFor(id: string): Conflict[] {
    return show.conflicts.filter((c) => c.actorId === id);
  }

  function addCrewMember() {
    if (contactsLocked) { gate(); return; }
    const colorIndex = show.crew.length % CAST_COLOR_PALETTE.length;
    const member: CrewMember = {
      id: `crew_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      firstName: "",
      lastName: "",
      role: "",
      color: CAST_COLOR_PALETTE[colorIndex] ?? "#424242",
    };
    onaddcrew?.(member);
    queueMicrotask(() => {
      const cards = crewListEl?.querySelectorAll(".cast-card");
      const last = cards?.[cards.length - 1];
      last?.scrollIntoView({ block: "center", behavior: "auto" });
      const firstInput = last?.querySelector<HTMLInputElement>(".cast-field-first");
      firstInput?.focus();
    });
  }

  function startEditConflict(c: Conflict) {
    editConflictId = c.id;
    editConflictKind = c.startTime ? "timed" : "all-day";
    editConflictStart = c.startTime ?? "";
    editConflictEnd = c.endTime ?? "";
    editConflictLabel = c.label ?? "";
  }

  function saveEditConflict() {
    if (!editConflictId) return;
    const old = show.conflicts.find((c) => c.id === editConflictId);
    if (!old) return;
    onremoveconflict?.(editConflictId);
    onaddconflict?.({
      id: `conf_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      actorId: old.actorId,
      date: old.date,
      label: editConflictLabel.trim(),
      ...(editConflictKind === "timed" && editConflictStart && editConflictEnd
        ? { startTime: editConflictStart, endTime: editConflictEnd }
        : {}),
    });
    editConflictId = null;
  }

  function onBackdropKey(e: KeyboardEvent) {
    if (e.key === "Escape") onclose();
  }

  // Draggable modal
  let dragOffset = $state<{ x: number; y: number } | null>(null);
  let modalPos = $state({ x: 0, y: 0 });
  let dragging = $state(false);

  function onDragStart(e: MouseEvent) {
    // Only drag from the header area, not buttons
    if ((e.target as Element).closest("button")) return;
    dragging = true;
    dragOffset = { x: e.clientX - modalPos.x, y: e.clientY - modalPos.y };
    e.preventDefault();
  }

  function onDragMove(e: MouseEvent) {
    if (!dragging || !dragOffset) return;
    modalPos = { x: e.clientX - dragOffset.x, y: e.clientY - dragOffset.y };
  }

  function onDragEnd() {
    dragging = false;
    dragOffset = null;
  }
</script>

<svelte:window
  onkeydown={embedded ? undefined : onBackdropKey}
  onmousemove={embedded ? undefined : onDragMove}
  onmouseup={embedded ? undefined : onDragEnd}
/>

{#if !embedded}
<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="backdrop" onclick={onclose}></div>
{/if}

<div
  class="modal"
  class:dragging
  class:modal-embedded={embedded}
  role={embedded ? undefined : "dialog"}
  aria-modal={embedded ? undefined : "true"}
  aria-label={embedded ? undefined : "Show defaults"}
  style:transform={embedded ? undefined : `translate(calc(-50% + ${modalPos.x}px), ${modalPos.y}px)`}
>
  {#if !embedded}
  <header class="modal-header">
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="header-top" onmousedown={onDragStart} style:cursor="grab">
      <div>
        <div class="eyebrow">Defaults</div>
        <h2>Show-wide settings</h2>
      </div>
      <button type="button" class="close" onclick={onclose} aria-label="Close">
        ×
      </button>
    </div>
  </header>
  {/if}

    <!-- svelte-ignore a11y_no_noninteractive_element_to_interactive_role -->
    <nav class="tab-nav" role="tablist">
      {#each [
        { id: "appearance", label: "Appearance" },
        { id: "schedule", label: "Schedule" },
        { id: "event-types", label: "Event Types" },
        { id: "locations", label: "Locations" },
        ...(hideContactsTab ? [] : [{ id: "contacts", label: "Contacts" }]),
        ...(hideShowTab ? [] : [{ id: "show", label: "Show" }]),
      ] as tab (tab.id)}
        <button
          type="button"
          class="tab-btn"
          class:active={activeTab === tab.id}
          role="tab"
          aria-selected={activeTab === tab.id}
          onclick={() => { activeTab = tab.id as Tab; if (tab.id === "contacts") focusContactsSection(); }}
        >
          {tab.label}
        </button>
      {/each}
    </nav>

  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="modal-body" onclick={() => {
    if (castColorPopoverFor) castColorPopoverFor = null;
    if (crewColorPopoverFor) crewColorPopoverFor = null;
  }}>
    <!-- ==================== APPEARANCE TAB ==================== -->
    {#if activeTab === "appearance"}

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
        <h3>Visibility</h3>
        <p class="hint">Toggle what's shown on the calendar grid.</p>
      </div>
      <div class="visibility-toggles">
        <label class="vis-toggle">
          <input type="checkbox" checked={show.settings.showEventTypes ?? true} onchange={(e) => onchange({ showEventTypes: e.currentTarget.checked })} />
          <span>Event type badges</span>
        </label>
        <label class="vis-toggle">
          <input type="checkbox" checked={show.settings.showLocations ?? true} onchange={(e) => onchange({ showLocations: e.currentTarget.checked })} />
          <span>Locations</span>
        </label>
        <label class="vis-toggle">
          <input type="checkbox" checked={show.settings.showCastConflicts ?? true} onchange={(e) => onchange({ showCastConflicts: e.currentTarget.checked })} />
          <span>Cast conflicts</span>
        </label>
        <label class="vis-toggle">
          <input type="checkbox" checked={show.settings.showCrewConflicts ?? false} onchange={(e) => onchange({ showCrewConflicts: e.currentTarget.checked })} />
          <span>Production team conflicts</span>
        </label>
        <label class="vis-toggle" title="Show text labels next to each icon in the top toolbar">
          <input type="checkbox" checked={show.settings.showToolbarLabels ?? false} onchange={(e) => onchange({ showToolbarLabels: e.currentTarget.checked })} />
          <span>Toolbar text labels</span>
        </label>
        <label class="vis-toggle" title="Hide days with no calls, description, or notes from the list view">
          <input type="checkbox" checked={show.settings.hideBlankListDays ?? false} onchange={(e) => onchange({ hideBlankListDays: e.currentTarget.checked })} />
          <span>Hide blank days in list view</span>
        </label>
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
      {#if !embedded}
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
      {/if}
    </section>

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
        <div class="size-row">
          <span class="size-label size-label-all">Apply to all</span>
          <div class="size-chips">
            {#each sizeOpts as opt (opt.value)}
              <button
                type="button"
                class="size-chip"
                onclick={() => applySizeToAll(opt.value)}
              >
                {opt.label}
              </button>
            {/each}
            <button
              type="button"
              class="size-reset"
              onclick={() => applySizeToAll("md")}
            >
              Reset
            </button>
          </div>
        </div>
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
              {#each sizeOpts as opt (opt.value)}
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
        <h3>Holidays</h3>
        <p class="hint">
          Holidays show as amber badges on the calendar. Toggle US holidays or add your own.
        </p>
      </div>

      <div class="holiday-toggles">
        <label class="vis-toggle">
          <input
            type="checkbox"
            checked={show.settings.showHolidays ?? true}
            onchange={(e) => onchange({ showHolidays: e.currentTarget.checked })}
          />
          <span>Show holiday badges on calendar</span>
        </label>
        <label class="vis-toggle">
          <input
            type="checkbox"
            checked={show.settings.showUsHolidays ?? false}
            onchange={(e) => onchange({ showUsHolidays: e.currentTarget.checked })}
          />
          <span>Include US federal holidays</span>
        </label>
      </div>

      {#if (show.settings.showHolidays ?? true) && !(hideShowTab && hideContactsTab)}
        {@const allHolidays = holidaysInRange(
          show.show.startDate,
          show.show.endDate,
          show.settings.showUsHolidays ?? false,
          show.settings.customHolidays ?? [],
        )}
        {#if allHolidays.length > 0}
          <div class="holiday-list">
            {#each allHolidays as h (h.date + h.name)}
              {@const isHidden = (show.settings.hiddenHolidays ?? []).includes(h.name)}
              <div class="holiday-row" class:holiday-hidden={isHidden}>
                <input
                  type="checkbox"
                  checked={!isHidden}
                  title={isHidden ? `Show ${h.name}` : `Hide ${h.name}`}
                  onchange={() => toggleHoliday(h.name)}
                />
                <span class="holiday-badge-preview">{h.name}</span>
                <span class="holiday-date">{h.date}</span>
                {#if h.source === "custom"}
                  <button
                    type="button"
                    class="remove-btn"
                    title="Remove"
                    aria-label={`Remove ${h.name}`}
                    onclick={() => removeCustomHoliday(h.date, h.name)}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" fill="currentColor" width="16" height="16"><path d="m256-200-56-56 224-224-224-224 56-56 224 224 224-224 56 56-224 224 224 224-56 56-224-224-224 224Z"/></svg>
                  </button>
                {:else}
                  <span class="holiday-source">US</span>
                {/if}
              </div>
            {/each}
          </div>
        {/if}

        {#if addingHoliday}
          <div class="holiday-add-form">
            <input
              type="date"
              class="holiday-add-date"
              bind:value={newHolidayDate}
              min={show.show.startDate}
              max={show.show.endDate}
            />
            <input
              type="text"
              class="holiday-add-name"
              placeholder="Holiday name"
              bind:value={newHolidayName}
              onkeydown={(e) => { if (e.key === "Enter") addCustomHoliday(); if (e.key === "Escape") { addingHoliday = false; } }}
            />
            <button type="button" class="ghost-btn" onclick={addCustomHoliday}>Add</button>
            <button type="button" class="mockup-action-btn" onclick={() => (addingHoliday = false)}>Cancel</button>
          </div>
        {:else}
          <button type="button" class="add-location-btn" onclick={() => (addingHoliday = true)}>
            + Add custom holiday
          </button>
        {/if}
      {/if}
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

    <!-- ==================== EVENT TYPES TAB ==================== -->
    {:else if activeTab === "event-types"}

    <section class="section">
      <div class="section-header section-header-row">
        <div>
          <h3>Event types</h3>
          <p class="hint">
            Badges applied to each day. Star a type to make it the
            default for new days. Colors match the grid and the
            toolbar pills.
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
          {@const isDefaultET = (show.settings.defaultEventType ?? "") === type.id}
          <li class="event-type-card">
            <div class="et-row">
              <button
                type="button"
                class="star-btn"
                class:starred={isDefaultET}
                title={isDefaultET
                  ? `Unset ${type.name || "event type"} as default`
                  : `Set ${type.name || "event type"} as default`}
                aria-label={isDefaultET
                  ? `Unset ${type.name || "event type"} as default`
                  : `Set ${type.name || "event type"} as default`}
                onclick={() => setDefaultEventType(type.id)}
              >
                {isDefaultET ? "★" : "☆"}
              </button>
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
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" fill="currentColor" width="18" height="18"><path d="m256-200-56-56 224-224-224-224 56-56 224 224 224-224 56 56-224 224 224 224-56 56-224-224-224 224Z"/></svg>
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
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" fill="currentColor" width="18" height="18"><path d="M200-80q-33 0-56.5-23.5T120-160v-560q0-33 23.5-56.5T200-800h40v-80h80v80h320v-80h80v80h40q33 0 56.5 23.5T840-720v560q0 33-23.5 56.5T760-80H200Zm0-80h560v-400H200v400Zm0-480h560v-80H200v80Zm0 0v-80 80Z"/></svg>
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
                title={isDefault
                  ? `Unset ${preset} as default`
                  : `Set ${preset} as default`}
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
                title={`Remove ${preset}`}
                onclick={() => onremovelocationpreset(preset)}
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" fill="currentColor" width="16" height="16"><path d="m256-200-56-56 224-224-224-224 56-56 224 224 224-224 56 56-224 224 224 224-56 56-224-224-224 224Z"/></svg>
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

    <!-- ==================== CONTACTS TAB ==================== -->
    {#if activeTab === "contacts"}

    {#if contactsLocked}
      <div class="contacts-locked-banner">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" fill="currentColor" width="16" height="16" aria-hidden="true"><path d="M240-80q-33 0-56.5-23.5T160-160v-400q0-33 23.5-56.5T240-640h40v-80q0-83 58.5-141.5T480-920q83 0 141.5 58.5T680-720v80h40q33 0 56.5 23.5T800-560v400q0 33-23.5 56.5T720-80H240Zm240-200q33 0 56.5-23.5T560-360q0-33-23.5-56.5T480-440q-33 0-56.5 23.5T400-360q0 33 23.5 56.5T480-280ZM360-640h240v-80q0-50-35-85t-85-35q-50 0-85 35t-35 85v80Z"/></svg>
        <span>Cast and production team editing is part of the paid version. You can still browse and use the conflict collection link to try the flow.</span>
      </div>
    {/if}

    <div class="contacts-subtabs">
      <button type="button" class="contacts-subtab" class:active={contactsSubTab === "cast"} onclick={() => { contactsSubTab = "cast"; queueMicrotask(() => castListEl?.focus()); }}>Cast</button>
      <button type="button" class="contacts-subtab" class:active={contactsSubTab === "crew"} onclick={() => { contactsSubTab = "crew"; queueMicrotask(() => crewListEl?.focus()); }}>Production Team</button>
    </div>

    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    {#if contactsSubTab === "cast"}
      <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
      <section class="section" tabindex="-1" bind:this={castListEl}
        onpointerdowncapture={contactsPointerGuard}
        onkeydowncapture={contactsKeyGuard}
        onpastecapture={contactsPasteGuard}
        onkeydown={(e) => {
        if (e.shiftKey && e.key === ">") { castExpandAll(); e.preventDefault(); }
        if (e.shiftKey && e.key === "<") { castCollapseAll(); e.preventDefault(); }
      }}>
        <div class="section-header section-header-row">
          <div>
            <h3>Cast ({show.cast.length})</h3>
            <p class="hint">Click a card to expand and edit. Shift+&lt; / Shift+&gt; to collapse/expand all.</p>
          </div>
          <div class="section-header-actions">
            {#if oncollectconflicts}
              <button type="button" class="ghost-btn ghost-btn-outline" onclick={oncollectconflicts} title="Send a link to actors so they can submit their conflicts">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" fill="currentColor" width="14" height="14"><path d="M200-80q-33 0-56.5-23.5T120-160v-560q0-33 23.5-56.5T200-800h40v-80h80v80h320v-80h80v80h40q33 0 56.5 23.5T840-720v244q-19-9-39-15.5t-41-9.5v-59H200v400h252q7 22 16.5 42T491-80H200Zm0-560h560v-80H200v80Zm0 0v-80 80Zm460 520L528-252l56-56 76 76 152-152 56 56-208 208Z"/></svg>
                Collect conflicts
              </button>
            {/if}
            <button type="button" class="ghost-btn ghost-btn-outline" onclick={() => { if (contactsLocked) { gate(); return; } csvFileInput?.click(); }}>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" fill="currentColor" width="14" height="14"><path d="M440-320v-326L336-542l-56-58 200-200 200 200-56 58-104-104v326h-80ZM240-160q-33 0-56.5-23.5T160-240v-120h80v120h480v-120h80v120q0 33-23.5 56.5T720-160H240Z"/></svg>
              Import CSV
            </button>
            <input type="file" accept=".csv" class="sr-only" bind:this={csvFileInput} onchange={handleCsvFile} />
            <button type="button" class="ghost-btn" onclick={addCastMember}>+ Add actor</button>
          </div>
        </div>

        <!-- CSV Import Result Summary -->
        {#if csvImportResult}
          <div class="csv-result-banner">
            <div class="csv-result-content">
              <strong>Import complete</strong>
              <ul class="csv-result-list">
                {#if csvImportResult.added.length > 0}
                  <li>{csvImportResult.added.length} new actor{csvImportResult.added.length !== 1 ? "s" : ""} added</li>
                {/if}
                {#if csvImportResult.updated.length > 0}
                  <li>{csvImportResult.updated.length} existing actor{csvImportResult.updated.length !== 1 ? "s" : ""} updated:</li>
                  {#each csvImportResult.updated as upd}
                    {@const member = show.cast.find((m) => m.id === upd.id)}
                    {#if member}
                      <li class="csv-result-detail">{member.firstName} {member.lastName}: {Object.keys(upd.patch).map((k) => CAST_FIELD_LABELS[k as CastField] ?? k).join(", ")}</li>
                    {/if}
                  {/each}
                {/if}
                {#if csvImportResult.skipped > 0}
                  <li>{csvImportResult.skipped} row{csvImportResult.skipped !== 1 ? "s" : ""} skipped (already exist)</li>
                {/if}
                {#if csvImportResult.added.length === 0 && csvImportResult.updated.length === 0 && csvImportResult.skipped === 0}
                  <li>No rows to import</li>
                {/if}
              </ul>
            </div>
            <button type="button" class="csv-result-dismiss" onclick={dismissImportResult}>Dismiss</button>
          </div>
        {/if}

        <!-- CSV Column Mapping UI -->
        {#if csvImportParsed}
          <div class="csv-import-panel">
            <div class="csv-import-header">
              <h4>Map CSV Columns</h4>
              <p class="hint">Assign each column from your CSV to a cast field, or skip it.</p>
            </div>

            <div class="csv-mapping-table">
              <div class="csv-mapping-row csv-mapping-header-row">
                <span class="csv-mapping-col-name">CSV Column</span>
                <span class="csv-mapping-col-sample">Sample</span>
                <span class="csv-mapping-col-field">Map to</span>
              </div>
              {#each csvImportParsed.headers as header, idx}
                {@const sample = csvImportParsed.rows[0]?.[idx] ?? ""}
                <div class="csv-mapping-row">
                  <span class="csv-mapping-col-name" title={header}>{header}</span>
                  <span class="csv-mapping-col-sample" title={sample}>{sample || "-"}</span>
                  <select
                    class="csv-mapping-select"
                    value={csvImportMapping[idx] ?? ""}
                    onchange={(e) => updateCsvMapping(idx, e.currentTarget.value)}
                  >
                    <option value="">Skip</option>
                    {#each Object.entries(CAST_FIELD_LABELS) as [field, label]}
                      <option value={field}>{label}</option>
                    {/each}
                  </select>
                </div>
              {/each}
            </div>

            {#if csvPreviewRows.length > 0}
              <div class="csv-preview-section">
                <h4>Preview (first {csvPreviewRows.length} row{csvPreviewRows.length !== 1 ? "s" : ""})</h4>
                <div class="csv-preview-scroll">
                  <table class="csv-preview-table">
                    <thead>
                      <tr>
                        {#each csvImportMapping as field}
                          {#if field}
                            <th>{CAST_FIELD_LABELS[field]}</th>
                          {/if}
                        {/each}
                      </tr>
                    </thead>
                    <tbody>
                      {#each csvPreviewRows as row}
                        <tr>
                          {#each csvImportMapping as field, idx}
                            {#if field}
                              <td>{row[idx]?.trim() || ""}</td>
                            {/if}
                          {/each}
                        </tr>
                      {/each}
                    </tbody>
                  </table>
                </div>
              </div>
            {/if}

            <div class="csv-import-mode">
              <span class="csv-import-mode-label">When a name matches an existing cast member:</span>
              <label class="csv-radio-label">
                <input type="radio" name="csv-import-mode" value="add" bind:group={csvImportMode} />
                Add new only (skip matches)
              </label>
              <label class="csv-radio-label">
                <input type="radio" name="csv-import-mode" value="fill" bind:group={csvImportMode} />
                Merge - fill blank fields only
              </label>
              <label class="csv-radio-label">
                <input type="radio" name="csv-import-mode" value="overwrite" bind:group={csvImportMode} />
                Merge - overwrite with CSV values
              </label>
            </div>

            <div class="csv-import-actions">
              <button type="button" class="csv-cancel-btn" onclick={cancelCsvImport}>Cancel</button>
              <button type="button" class="ghost-btn" onclick={executeCsvImport}>
                Import {csvImportParsed.rows.length} row{csvImportParsed.rows.length !== 1 ? "s" : ""}
              </button>
            </div>
          </div>
        {:else}
        <div class="mockup-toolbar">
          <div class="mockup-toggle-group">
            <button type="button" class="mockup-toggle-labeled" title="Collapse all (Shift+<)" onclick={castCollapseAll}>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" fill="currentColor" width="14" height="14"><path d="M480-528 296-344l-56-56 240-240 240 240-56 56-184-184Z"/></svg>
              Collapse All
            </button>
            <button type="button" class="mockup-toggle-labeled" title="Expand all (Shift+>)" onclick={castExpandAll}>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" fill="currentColor" width="14" height="14"><path d="M480-344 240-584l56-56 184 184 184-184 56 56-240 240Z"/></svg>
              Expand All
            </button>
          </div>
        </div>

        {#if show.cast.length === 0}
          <p class="empty-hint">No cast members yet. Click "+ Add actor" or import a CSV to get started.</p>
        {/if}

        <div class="mockup-list">
          {#each show.cast as member, idx (member.id)}
            {@const isExpanded = expandedCast.has(member.id)}
            <div class="mockup-card" class:expanded={isExpanded}>
              <div class="mockup-card-row">
                <div class="mockup-reorder">
                  <button type="button" class="mockup-reorder-btn" disabled={idx === 0} title="Move up" onclick={() => onreordermember?.(member.id, "up")}>
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" fill="currentColor" width="12" height="12"><path d="M480-528 296-344l-56-56 240-240 240 240-56 56-184-184Z"/></svg>
                  </button>
                  <button type="button" class="mockup-reorder-btn" disabled={idx === show.cast.length - 1} title="Move down" onclick={() => onreordermember?.(member.id, "down")}>
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" fill="currentColor" width="12" height="12"><path d="M480-344 240-584l56-56 184 184 184-184 56 56-240 240Z"/></svg>
                  </button>
                </div>
                <div class="cast-color-anchor">
                  <button
                    type="button"
                    class="mockup-dot"
                    style:background={member.color}
                    title="Change color"
                    onclick={(e) => { e.stopPropagation(); castColorPopoverFor = castColorPopoverFor === member.id ? null : member.id; }}
                  ></button>
                  {#if castColorPopoverFor === member.id}
                    <!-- svelte-ignore a11y_click_events_have_key_events -->
                    <!-- svelte-ignore a11y_no_static_element_interactions -->
                    <div class="cast-color-popover" onclick={(e) => e.stopPropagation()}>
                      {#each CAST_COLOR_PALETTE as hex (hex)}
                        <button
                          type="button"
                          class="cast-color-swatch"
                          class:selected={member.color === hex}
                          style:background={hex}
                          onclick={() => { onupdatemember?.(member.id, { color: hex }); castColorPopoverFor = null; }}
                        ></button>
                      {/each}
                    </div>
                  {/if}
                </div>
                <button type="button" class="mockup-card-main" onclick={() => castToggle(member.id)}>
                  <div class="mockup-name-block">
                    <span class="mockup-name-line">
                      <span class="mockup-name">{[member.firstName, member.middleName, member.lastName].filter(Boolean).join(" ")}{member.suffix ? `, ${member.suffix}` : ""}</span>
                      {#if member.pronouns}<span class="mockup-pill">{member.pronouns}</span>{/if}
                    </span>
                    {#if member.character}
                      <span class="mockup-character">{member.character}</span>
                    {/if}
                  </div>
                  <div class="mockup-meta-pills">
                    {#if castConflictCount(member.id) > 0}
                      <span class="mockup-pill mockup-pill-warn">{castConflictCount(member.id)} conflict{castConflictCount(member.id) !== 1 ? "s" : ""}</span>
                    {/if}
                  </div>
                  <span class="mockup-chevron">{isExpanded ? "▾" : "▸"}</span>
                </button>
              </div>

              {#if isExpanded}
                <div class="mockup-details">
                  <div class="mockup-detail-row-4">
                    <div class="mockup-detail-item">
                      <span class="mockup-detail-label">First name</span>
                      <input type="text" class="cast-field" value={member.firstName} placeholder="First" oninput={(e) => onupdatemember?.(member.id, { firstName: e.currentTarget.value })} />
                    </div>
                    <div class="mockup-detail-item">
                      <span class="mockup-detail-label">Middle</span>
                      <input type="text" class="cast-field" value={member.middleName ?? ""} placeholder="Middle" oninput={(e) => onupdatemember?.(member.id, { middleName: e.currentTarget.value || undefined })} />
                    </div>
                    <div class="mockup-detail-item">
                      <span class="mockup-detail-label">Last name</span>
                      <input type="text" class="cast-field" value={member.lastName} placeholder="Last" oninput={(e) => onupdatemember?.(member.id, { lastName: e.currentTarget.value })} />
                    </div>
                    <div class="mockup-detail-item">
                      <span class="mockup-detail-label">Suffix</span>
                      <input type="text" class="cast-field" value={member.suffix ?? ""} placeholder="Sfx" maxlength="5" oninput={(e) => onupdatemember?.(member.id, { suffix: e.currentTarget.value || undefined })} />
                    </div>
                  </div>
                  <div class="mockup-detail-row-3">
                    <div class="mockup-detail-item">
                      <span class="mockup-detail-label">Pronouns</span>
                      <input type="text" class="cast-field" value={member.pronouns ?? ""} placeholder="Pronouns" oninput={(e) => onupdatemember?.(member.id, { pronouns: e.currentTarget.value || undefined })} />
                    </div>
                    <div class="mockup-detail-item">
                      <span class="mockup-detail-label">Email</span>
                      <input type="text" class="cast-field" value={member.email ?? ""} placeholder="Email" oninput={(e) => onupdatemember?.(member.id, { email: e.currentTarget.value || undefined })} />
                    </div>
                    <div class="mockup-detail-item">
                      <span class="mockup-detail-label">Phone</span>
                      <input type="text" class="cast-field" value={member.phone ?? ""} placeholder="Phone" oninput={(e) => onupdatemember?.(member.id, { phone: e.currentTarget.value || undefined })} onblur={(e) => { const v = e.currentTarget.value; if (v) onupdatemember?.(member.id, { phone: formatPhone(v) }); }} />
                    </div>
                  </div>
                  <div class="mockup-detail-row-1">
                    <div class="mockup-detail-item">
                      <span class="mockup-detail-label">Character</span>
                      <input type="text" class="cast-field" value={member.character} placeholder="Character" oninput={(e) => onupdatemember?.(member.id, { character: e.currentTarget.value })} />
                    </div>
                  </div>

                  {#if castConflictsFor(member.id).length > 0}
                    {@const memberConflicts = castConflictsFor(member.id)}
                    <div class="mockup-conflicts">
                      <span class="mockup-detail-label">Conflicts</span>
                      <div class="mockup-conflict-tags">
                        {#each memberConflicts as c (c.id)}
                          <span class="mockup-conflict-tag">
                            {c.date} - {conflictLabel(c)}{#if c.label} - {c.label}{/if}
                            <button type="button" class="mockup-conflict-x" title="Remove conflict" onclick={(e) => { e.stopPropagation(); onremoveconflict?.(c.id); }}>
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" fill="currentColor" width="10" height="10"><path d="m256-200-56-56 224-224-224-224 56-56 224 224 224-224 56 56-224 224 224 224-56 56-224-224-224 224Z"/></svg>
                            </button>
                          </span>
                        {/each}
                      </div>
                    </div>
                  {/if}

                  <div class="mockup-card-actions">
                    <button type="button" class="mockup-action-btn" onclick={(e) => { e.stopPropagation(); castConflictPickerFor = member.id; }}>
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" fill="currentColor" width="14" height="14"><path d="M200-80q-33 0-56.5-23.5T120-160v-560q0-33 23.5-56.5T200-800h40v-80h80v80h320v-80h80v80h40q33 0 56.5 23.5T840-720v560q0 33-23.5 56.5T760-80H200Zm0-80h560v-400H200v400Zm0-480h560v-80H200v80Zm0 0v-80 80Z"/></svg>
                      Add conflicts
                    </button>
                    <button type="button" class="mockup-action-btn mockup-action-danger" onclick={(e) => { e.stopPropagation(); requestCastDelete(member.id); }}>
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" fill="currentColor" width="14" height="14"><path d="m256-200-56-56 224-224-224-224 56-56 224 224 224-224 56 56-224 224 224 224-56 56-224-224-224 224Z"/></svg>
                      Remove actor
                    </button>
                  </div>
                </div>
              {/if}
            </div>
          {/each}
        </div>
        {/if}

        {#if castDeleteConfirmFor}
          {@const delMember = show.cast.find((m) => m.id === castDeleteConfirmFor)}
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div class="cast-confirm-overlay" onclick={() => (castDeleteConfirmFor = null)}>
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div class="cast-confirm" onclick={(e) => e.stopPropagation()}>
              <p><strong>{delMember?.firstName} {delMember?.lastName}</strong> is called on scheduled days. Remove anyway?</p>
              <div class="cast-confirm-actions">
                <button type="button" onclick={() => (castDeleteConfirmFor = null)}>Cancel</button>
                <button type="button" class="cast-confirm-delete" onclick={() => { onremovemember?.(castDeleteConfirmFor!); castDeleteConfirmFor = null; }}>Remove</button>
              </div>
            </div>
          </div>
        {/if}

        {#if castConflictMember}
          <ActorConflictPicker
            member={castConflictMember}
            {show}
            onaddconflict={(c) => onaddconflict?.(c)}
            onremoveconflict={(id) => onremoveconflict?.(id)}
            onclose={() => (castConflictPickerFor = null)}
          />
        {/if}
      </section>
    {:else}
      <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
      <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
      <section class="section" tabindex="-1" bind:this={crewListEl}
        onpointerdowncapture={contactsPointerGuard}
        onkeydowncapture={contactsKeyGuard}
        onpastecapture={contactsPasteGuard}
        onkeydown={(e) => {
        if (e.shiftKey && e.key === ">") { crewExpandAll(); e.preventDefault(); }
        if (e.shiftKey && e.key === "<") { crewCollapseAll(); e.preventDefault(); }
      }}>
        <div class="section-header section-header-row">
          <div>
            <h3>Production Team ({show.crew.length})</h3>
            <p class="hint">Click a card to expand and edit. Shift+&lt; / Shift+&gt; to collapse/expand all.</p>
          </div>
          <div class="section-header-actions">
            <button type="button" class="ghost-btn ghost-btn-outline" onclick={() => { if (contactsLocked) { gate(); return; } crewCsvFileInput?.click(); }}>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" fill="currentColor" width="14" height="14"><path d="M440-320v-326L336-542l-56-58 200-200 200 200-56 58-104-104v326h-80ZM240-160q-33 0-56.5-23.5T160-240v-120h80v120h480v-120h80v120q0 33-23.5 56.5T720-160H240Z"/></svg>
              Import CSV
            </button>
            <input type="file" accept=".csv" class="sr-only" bind:this={crewCsvFileInput} onchange={handleCrewCsvFile} />
            <button type="button" class="ghost-btn" onclick={addCrewMember}>+ Add member</button>
          </div>
        </div>

        <!-- Crew CSV Import Result Summary -->
        {#if crewCsvResult}
          <div class="csv-result-banner">
            <div class="csv-result-content">
              <strong>Import complete</strong>
              <ul class="csv-result-list">
                {#if crewCsvResult.added.length > 0}
                  <li>{crewCsvResult.added.length} new member{crewCsvResult.added.length !== 1 ? "s" : ""} added</li>
                {/if}
                {#if crewCsvResult.updated.length > 0}
                  <li>{crewCsvResult.updated.length} existing member{crewCsvResult.updated.length !== 1 ? "s" : ""} updated:</li>
                  {#each crewCsvResult.updated as upd}
                    {@const member = show.crew.find((m) => m.id === upd.id)}
                    {#if member}
                      <li class="csv-result-detail">{member.firstName} {member.lastName}: {Object.keys(upd.patch).map((k) => CREW_FIELD_LABELS[k as CrewField] ?? k).join(", ")}</li>
                    {/if}
                  {/each}
                {/if}
                {#if crewCsvResult.skipped > 0}
                  <li>{crewCsvResult.skipped} row{crewCsvResult.skipped !== 1 ? "s" : ""} skipped (already exist)</li>
                {/if}
                {#if crewCsvResult.added.length === 0 && crewCsvResult.updated.length === 0 && crewCsvResult.skipped === 0}
                  <li>No rows to import</li>
                {/if}
              </ul>
            </div>
            <button type="button" class="csv-result-dismiss" onclick={dismissCrewImportResult}>Dismiss</button>
          </div>
        {/if}

        <!-- Crew CSV Column Mapping UI -->
        {#if crewCsvParsed}
          <div class="csv-import-panel">
            <div class="csv-import-header">
              <h4>Map CSV Columns</h4>
              <p class="hint">Assign each column from your CSV to a crew field, or skip it.</p>
            </div>

            <div class="csv-mapping-table">
              <div class="csv-mapping-row csv-mapping-header-row">
                <span class="csv-mapping-col-name">CSV Column</span>
                <span class="csv-mapping-col-sample">Sample</span>
                <span class="csv-mapping-col-field">Map to</span>
              </div>
              {#each crewCsvParsed.headers as header, idx}
                {@const sample = crewCsvParsed.rows[0]?.[idx] ?? ""}
                <div class="csv-mapping-row">
                  <span class="csv-mapping-col-name" title={header}>{header}</span>
                  <span class="csv-mapping-col-sample" title={sample}>{sample || "-"}</span>
                  <select
                    class="csv-mapping-select"
                    value={crewCsvMapping[idx] ?? ""}
                    onchange={(e) => updateCrewCsvMapping(idx, e.currentTarget.value)}
                  >
                    <option value="">Skip</option>
                    {#each Object.entries(CREW_FIELD_LABELS) as [field, label]}
                      <option value={field}>{label}</option>
                    {/each}
                  </select>
                </div>
              {/each}
            </div>

            {#if crewCsvPreviewRows.length > 0}
              <div class="csv-preview-section">
                <h4>Preview (first {crewCsvPreviewRows.length} row{crewCsvPreviewRows.length !== 1 ? "s" : ""})</h4>
                <div class="csv-preview-scroll">
                  <table class="csv-preview-table">
                    <thead>
                      <tr>
                        {#each crewCsvMapping as field}
                          {#if field}
                            <th>{CREW_FIELD_LABELS[field]}</th>
                          {/if}
                        {/each}
                      </tr>
                    </thead>
                    <tbody>
                      {#each crewCsvPreviewRows as row}
                        <tr>
                          {#each crewCsvMapping as field, idx}
                            {#if field}
                              <td>{row[idx]?.trim() || ""}</td>
                            {/if}
                          {/each}
                        </tr>
                      {/each}
                    </tbody>
                  </table>
                </div>
              </div>
            {/if}

            <div class="csv-import-mode">
              <span class="csv-import-mode-label">When a name matches an existing crew member:</span>
              <label class="csv-radio-label">
                <input type="radio" name="crew-csv-import-mode" value="add" bind:group={crewCsvMode} />
                Add new only (skip matches)
              </label>
              <label class="csv-radio-label">
                <input type="radio" name="crew-csv-import-mode" value="fill" bind:group={crewCsvMode} />
                Merge - fill blank fields only
              </label>
              <label class="csv-radio-label">
                <input type="radio" name="crew-csv-import-mode" value="overwrite" bind:group={crewCsvMode} />
                Merge - overwrite with CSV values
              </label>
            </div>

            <div class="csv-import-actions">
              <button type="button" class="csv-cancel-btn" onclick={cancelCrewCsvImport}>Cancel</button>
              <button type="button" class="ghost-btn" onclick={executeCrewCsvImport}>
                Import {crewCsvParsed.rows.length} row{crewCsvParsed.rows.length !== 1 ? "s" : ""}
              </button>
            </div>
          </div>
        {:else}
        <div class="mockup-toolbar">
          <div class="mockup-toggle-group">
            <button type="button" class="mockup-toggle-labeled" title="Collapse all (Shift+<)" onclick={crewCollapseAll}>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" fill="currentColor" width="14" height="14"><path d="M480-528 296-344l-56-56 240-240 240 240-56 56-184-184Z"/></svg>
              Collapse All
            </button>
            <button type="button" class="mockup-toggle-labeled" title="Expand all (Shift+>)" onclick={crewExpandAll}>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" fill="currentColor" width="14" height="14"><path d="M480-344 240-584l56-56 184 184 184-184 56 56-240 240Z"/></svg>
              Expand All
            </button>
          </div>
        </div>

        {#if show.crew.length === 0}
          <p class="empty-hint">No production team members yet. Click "+ Add member" or import a CSV to get started.</p>
        {/if}

        <div class="mockup-list">
          {#each show.crew as member, idx (member.id)}
            {@const isExpanded = expandedCrew.has(member.id)}
            <div class="mockup-card" class:expanded={isExpanded}>
              <div class="mockup-card-row">
                <div class="mockup-reorder">
                  <button type="button" class="mockup-reorder-btn" disabled={idx === 0} title="Move up" onclick={() => onreordercrew?.(member.id, "up")}>
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" fill="currentColor" width="12" height="12"><path d="M480-528 296-344l-56-56 240-240 240 240-56 56-184-184Z"/></svg>
                  </button>
                  <button type="button" class="mockup-reorder-btn" disabled={idx === show.crew.length - 1} title="Move down" onclick={() => onreordercrew?.(member.id, "down")}>
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" fill="currentColor" width="12" height="12"><path d="M480-344 240-584l56-56 184 184 184-184 56 56-240 240Z"/></svg>
                  </button>
                </div>
                <div class="cast-color-anchor">
                  <button
                    type="button"
                    class="mockup-dot"
                    style:background={member.color}
                    title="Change color"
                    onclick={(e) => { e.stopPropagation(); crewColorPopoverFor = crewColorPopoverFor === member.id ? null : member.id; }}
                  ></button>
                  {#if crewColorPopoverFor === member.id}
                    <!-- svelte-ignore a11y_click_events_have_key_events -->
                    <!-- svelte-ignore a11y_no_static_element_interactions -->
                    <div class="cast-color-popover" onclick={(e) => e.stopPropagation()}>
                      {#each CAST_COLOR_PALETTE as hex (hex)}
                        <button
                          type="button"
                          class="cast-color-swatch"
                          class:selected={member.color === hex}
                          style:background={hex}
                          onclick={() => { onupdatecrew?.(member.id, { color: hex }); crewColorPopoverFor = null; }}
                        ></button>
                      {/each}
                    </div>
                  {/if}
                </div>
                <button type="button" class="mockup-card-main" onclick={() => crewToggle(member.id)}>
                  <div class="mockup-name-block">
                    <span class="mockup-name-line">
                      <span class="mockup-name">{[member.firstName, member.middleName, member.lastName].filter(Boolean).join(" ")}{member.suffix ? `, ${member.suffix}` : ""}</span>
                      {#if member.pronouns}<span class="mockup-pill">{member.pronouns}</span>{/if}
                    </span>
                    {#if member.role}
                      <span class="mockup-character">{member.role}</span>
                    {/if}
                  </div>
                  <div class="mockup-meta-pills">
                    {#if crewConflictCount(member.id) > 0}
                      <span class="mockup-pill mockup-pill-warn">{crewConflictCount(member.id)} conflict{crewConflictCount(member.id) !== 1 ? "s" : ""}</span>
                    {/if}
                  </div>
                  <span class="mockup-chevron">{isExpanded ? "▾" : "▸"}</span>
                </button>
              </div>

              {#if isExpanded}
                <div class="mockup-details">
                  <div class="mockup-detail-row-4">
                    <div class="mockup-detail-item">
                      <span class="mockup-detail-label">First name</span>
                      <input type="text" class="cast-field" value={member.firstName} placeholder="First" oninput={(e) => onupdatecrew?.(member.id, { firstName: e.currentTarget.value })} />
                    </div>
                    <div class="mockup-detail-item">
                      <span class="mockup-detail-label">Middle</span>
                      <input type="text" class="cast-field" value={member.middleName ?? ""} placeholder="Middle" oninput={(e) => onupdatecrew?.(member.id, { middleName: e.currentTarget.value || undefined })} />
                    </div>
                    <div class="mockup-detail-item">
                      <span class="mockup-detail-label">Last name</span>
                      <input type="text" class="cast-field" value={member.lastName} placeholder="Last" oninput={(e) => onupdatecrew?.(member.id, { lastName: e.currentTarget.value })} />
                    </div>
                    <div class="mockup-detail-item">
                      <span class="mockup-detail-label">Suffix</span>
                      <input type="text" class="cast-field" value={member.suffix ?? ""} placeholder="Sfx" maxlength="5" oninput={(e) => onupdatecrew?.(member.id, { suffix: e.currentTarget.value || undefined })} />
                    </div>
                  </div>
                  <div class="mockup-detail-row-3">
                    <div class="mockup-detail-item">
                      <span class="mockup-detail-label">Pronouns</span>
                      <input type="text" class="cast-field" value={member.pronouns ?? ""} placeholder="Pronouns" oninput={(e) => onupdatecrew?.(member.id, { pronouns: e.currentTarget.value || undefined })} />
                    </div>
                    <div class="mockup-detail-item">
                      <span class="mockup-detail-label">Email</span>
                      <input type="text" class="cast-field" value={member.email ?? ""} placeholder="Email" oninput={(e) => onupdatecrew?.(member.id, { email: e.currentTarget.value || undefined })} />
                    </div>
                    <div class="mockup-detail-item">
                      <span class="mockup-detail-label">Phone</span>
                      <input type="text" class="cast-field" value={member.phone ?? ""} placeholder="Phone" oninput={(e) => onupdatecrew?.(member.id, { phone: e.currentTarget.value || undefined })} onblur={(e) => { const v = e.currentTarget.value; if (v) onupdatecrew?.(member.id, { phone: formatPhone(v) }); }} />
                    </div>
                  </div>
                  <div class="mockup-detail-row-1">
                    <div class="mockup-detail-item">
                      <span class="mockup-detail-label">Role</span>
                      <input type="text" class="cast-field" value={member.role} placeholder="Role" oninput={(e) => onupdatecrew?.(member.id, { role: e.currentTarget.value })} />
                    </div>
                  </div>

                  {#if crewConflictsFor(member.id).length > 0}
                    {@const memberConflicts = crewConflictsFor(member.id)}
                    <div class="mockup-conflicts">
                      <span class="mockup-detail-label">Conflicts</span>
                      <div class="mockup-conflict-tags">
                        {#each memberConflicts as c (c.id)}
                          <span class="mockup-conflict-tag">
                            {c.date} - {conflictLabel(c)}{#if c.label} - {c.label}{/if}
                            <button type="button" class="mockup-conflict-x" title="Remove conflict" onclick={(e) => { e.stopPropagation(); onremoveconflict?.(c.id); }}>
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" fill="currentColor" width="10" height="10"><path d="m256-200-56-56 224-224-224-224 56-56 224 224 224-224 56 56-224 224 224 224-56 56-224-224-224 224Z"/></svg>
                            </button>
                          </span>
                        {/each}
                      </div>
                    </div>
                  {/if}

                  <div class="mockup-card-actions">
                    <button type="button" class="mockup-action-btn" onclick={(e) => { e.stopPropagation(); crewConflictPickerFor = member.id; }}>
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" fill="currentColor" width="14" height="14"><path d="M200-80q-33 0-56.5-23.5T120-160v-560q0-33 23.5-56.5T200-800h40v-80h80v80h320v-80h80v80h40q33 0 56.5 23.5T840-720v560q0 33-23.5 56.5T760-80H200Zm0-80h560v-400H200v400Zm0-480h560v-80H200v80Zm0 0v-80 80Z"/></svg>
                      Add conflicts
                    </button>
                    <button type="button" class="mockup-action-btn mockup-action-danger" onclick={(e) => { e.stopPropagation(); crewDeleteConfirmFor = member.id; }}>
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" fill="currentColor" width="14" height="14"><path d="m256-200-56-56 224-224-224-224 56-56 224 224 224-224 56 56-224 224 224 224-56 56-224-224-224 224Z"/></svg>
                      Remove member
                    </button>
                  </div>
                </div>
              {/if}
            </div>
          {/each}
        </div>
        {/if}

        {#if crewDeleteConfirmFor}
          {@const delMember = show.crew.find((m) => m.id === crewDeleteConfirmFor)}
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div class="cast-confirm-overlay" onclick={() => (crewDeleteConfirmFor = null)}>
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div class="cast-confirm" onclick={(e) => e.stopPropagation()}>
              <p><strong>{delMember?.firstName} {delMember?.lastName}</strong> will be removed. Continue?</p>
              <div class="cast-confirm-actions">
                <button type="button" onclick={() => (crewDeleteConfirmFor = null)}>Cancel</button>
                <button type="button" class="cast-confirm-delete" onclick={() => { onremovecrew?.(crewDeleteConfirmFor!); crewDeleteConfirmFor = null; }}>Remove</button>
              </div>
            </div>
          </div>
        {/if}

        {#if crewAscast}
          <ActorConflictPicker
            member={crewAscast}
            {show}
            onaddconflict={(c) => onaddconflict?.(c)}
            onremoveconflict={(id) => onremoveconflict?.(id)}
            onclose={() => (crewConflictPickerFor = null)}
          />
        {/if}
      </section>
    {/if}

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

  {#if !embedded}
  <footer class="modal-footer">
    <button type="button" class="btn btn-primary" onclick={onclose}>Done</button>
  </footer>
  {/if}
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
    top: 5vh;
    left: 50%;
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

  .modal-embedded {
    position: static;
    top: auto;
    left: auto;
    width: 100%;
    max-width: none;
    max-height: none;
    transform: none !important;
    box-shadow: none;
    border-radius: 0;
    z-index: auto;
  }

  .modal.dragging {
    user-select: none;
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

  /* ---- Mobile: wrap the 6 tabs onto multiple rows so none are cut
     off. Without this, the tab-nav overflows horizontally inside the
     clipped modal and the later tabs (Contacts, Show) are unreachable. */
  @media (max-width: 768px) {
    .tab-nav {
      flex-wrap: wrap;
      padding: 0 var(--space-3);
      row-gap: 2px;
    }
    .tab-btn {
      padding: var(--space-2) var(--space-3);
      font-size: 0.75rem;
    }

    /* Schedule > Call times per weekday: at desktop width each row is
       a single line of [day-name] [start] - [end]. At phone width the
       two time pickers don't fit alongside the day label, so stack the
       times below the label. */
    .weekday-row {
      flex-direction: column;
      align-items: stretch;
      gap: var(--space-2);
      /* Override the desktop fit-content so each day card spans the
         full row width on mobile. Stacked content reads better inside
         a contained card than floating in a narrow shrink-wrapped box. */
      width: auto;
    }
    .weekday-toggle {
      flex: 0 0 auto;
      min-width: 0;
    }
    .weekday-times {
      justify-content: flex-start;
      padding-left: 26px; /* line up under the toggle text past its checkbox */
    }

    /* Contacts > Cast/Production Team: the header action row has 3
       buttons (Collect conflicts, Import CSV, + Add actor) which don't
       fit on one line at 375px. Allow the section header to wrap so
       the buttons drop below the title cleanly. */
    .section-header-row {
      flex-wrap: wrap;
    }
    .section-header-actions {
      flex-wrap: wrap;
      width: 100%;
    }
    .section-header-actions .ghost-btn,
    .section-header-actions .ghost-btn-outline {
      flex: 1 1 auto;
      min-width: 0;
      justify-content: center;
    }

    /* Expanded actor card detail rows. At desktop these pack 4 name
       fields (First/Middle/Last/Suffix) and 3 contact fields
       (Pronouns/Email/Phone) onto single rows. At phone width those
       columns shrink to ~50-90px which makes the inputs unusable -
       can't see what you're typing. Stack everything vertically: each
       field takes the full row so the input is wide enough to read.
       The base rules are defined later in this file at the same
       specificity, so we use !important inside the media query to make
       sure the mobile override takes precedence regardless of source
       order. */
    .mockup-detail-row-4,
    .mockup-detail-row-3 {
      grid-template-columns: 1fr !important;
    }
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

  .section:focus {
    outline: none;
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
    gap: 0;
  }

  .weekday-row {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: var(--color-bg-alt);
    /* Hug the content instead of stretching across the section. The
       parent .weekday-list is a flex column whose default align-items
       is `stretch`, which makes each row span the full width. width:
       fit-content tells the row to only take as much horizontal space
       as its day-name + time-pickers actually need. */
    width: fit-content;
  }
  .weekday-row.enabled {
    background: var(--color-surface);
    border-color: var(--color-border-strong);
  }

  .weekday-toggle {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    /* Size to content with a min-width that fits "Wednesday" so times
       stay vertically aligned across rows. Without this, flex:1 stretched
       the toggle to fill the row and left a huge dead zone between the
       day name and the time pickers. */
    flex: 0 0 auto;
    min-width: 7.5rem;
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
    gap: 0;
  }

  .event-type-card {
    background: transparent;
    border: none;
    border-bottom: 1px solid var(--color-border);
    border-radius: 0;
    padding: var(--space-3) 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .event-type-card:last-child {
    border-bottom: none;
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
    width: 1.5rem;
    height: 1.5rem;
    border-radius: var(--radius-full);
    border: 2px solid var(--color-surface);
    box-shadow: 0 0 0 1px var(--color-border-strong);
    cursor: pointer;
    padding: 0;
    font-size: 0.625rem;
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
    font-size: 0.6875rem;
    color: var(--color-text-muted);
    cursor: pointer;
    transition: color var(--transition-fast);
  }
  .et-dressperf:hover {
    color: var(--color-text);
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
    border: none;
    border-radius: var(--radius-full);
    background: transparent;
    color: var(--color-text-subtle);
    cursor: pointer;
    transition: color var(--transition-fast), background var(--transition-fast);
  }
  .cal-btn:hover {
    color: var(--color-plum);
    background: var(--color-bg-alt);
  }

  .visibility-toggles {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .vis-toggle {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-size: 0.8125rem;
    cursor: pointer;
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
    gap: var(--space-2);
  }

  .size-label {
    font-size: 0.8125rem;
    font-weight: 500;
    color: var(--color-text);
    min-width: 6rem;
    text-align: right;
  }

  .size-label-all {
    font-weight: 700;
    color: var(--color-plum);
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

  .size-reset {
    font: inherit;
    font-size: 0.6875rem;
    font-weight: 500;
    padding: 0 var(--space-2);
    height: 1.75rem;
    border: none;
    background: transparent;
    color: var(--color-text-muted);
    cursor: pointer;
    margin-left: var(--space-1);
  }

  .size-reset:hover {
    color: var(--color-danger, #dc2626);
  }

  .empty-hint {
    font-size: 0.8125rem;
    color: var(--color-text-muted);
    font-style: italic;
  }

  .contacts-locked-banner {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    margin-bottom: var(--space-3);
    background: var(--color-bg-alt);
    border-left: 3px solid var(--color-plum);
    border-radius: var(--radius-sm);
    font-size: 0.75rem;
    color: var(--color-text);
    line-height: 1.4;
  }
  .contacts-locked-banner svg {
    flex-shrink: 0;
    color: var(--color-plum);
  }

  .contacts-subtabs {
    display: flex;
    gap: 0;
    margin-bottom: var(--space-3);
    border-bottom: 1px solid var(--color-border);
  }

  .contacts-subtab {
    font: inherit;
    font-size: 0.8125rem;
    font-weight: 600;
    padding: var(--space-2) var(--space-4);
    border: none;
    background: transparent;
    color: var(--color-text-muted);
    cursor: pointer;
    border-bottom: 2px solid transparent;
    margin-bottom: -1px;
    transition: color var(--transition-fast), border-color var(--transition-fast);
  }

  .contacts-subtab:hover {
    color: var(--color-plum);
  }

  .contacts-subtab.active {
    color: var(--color-plum);
    border-bottom-color: var(--color-plum);
  }

  .cast-field {
    font: inherit;
    font-size: 0.8125rem;
    padding: var(--space-1) var(--space-2);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: var(--color-surface);
    color: var(--color-text);
    width: 100%;
    min-width: 0;
    box-sizing: border-box;
  }

  .cast-field:focus {
    outline: none;
    border-color: var(--color-teal);
  }

  .cast-color-anchor {
    position: relative;
    flex-shrink: 0;
  }

  .cast-color-popover {
    position: absolute;
    top: 100%;
    left: 0;
    z-index: 90;
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    padding: var(--space-2);
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-lg);
    width: 160px;
  }

  .cast-color-swatch {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    border: 2px solid transparent;
    cursor: pointer;
    padding: 0;
  }

  .cast-color-swatch.selected {
    border-color: var(--color-text);
    box-shadow: 0 0 0 1px var(--color-surface);
  }

  .cast-confirm-overlay {
    position: fixed;
    inset: 0;
    z-index: 200;
    background: rgba(0, 0, 0, 0.3);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .cast-confirm {
    background: var(--color-surface);
    padding: var(--space-4);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-lg);
    max-width: 320px;
  }

  .cast-confirm p {
    margin: 0 0 var(--space-3);
    font-size: 0.875rem;
  }

  .cast-confirm-actions {
    display: flex;
    gap: var(--space-2);
    justify-content: flex-end;
  }

  .cast-confirm-actions button {
    font: inherit;
    font-size: 0.8125rem;
    padding: var(--space-1) var(--space-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: transparent;
    cursor: pointer;
  }

  .cast-confirm-delete {
    background: var(--color-danger, #dc2626) !important;
    color: #fff !important;
    border-color: var(--color-danger, #dc2626) !important;
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
    /* Sized to fit the longest font name ("Playfair Display") with a
       little breathing room. The previous flex:1 stretched the select
       across the whole row, leaving a huge empty area to the right. */
    flex: 0 0 auto;
    width: 14rem;
    max-width: 100%;
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
    padding: var(--space-2) 0;
    border: none;
    border-bottom: 1px solid var(--color-border);
    border-radius: 0;
    background: transparent;
  }

  .star-btn,
  .star-btn-placeholder {
    background: transparent;
    border: none;
    font-size: 0.875rem;
    cursor: pointer;
    color: var(--color-text-subtle);
    padding: 0;
    width: 1.5rem;
    height: 1.5rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    text-align: center;
    border-radius: var(--radius-full);
    transition: color var(--transition-fast), background var(--transition-fast);
  }
  .star-btn:hover {
    color: var(--color-warning);
    background: var(--color-bg-alt);
  }
  .star-btn.starred {
    color: var(--color-warning);
  }

  .swatch {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    border: 2px solid var(--color-border);
    flex-shrink: 0;
    cursor: pointer;
    padding: 0;
    font-size: 0.5rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition: border-color var(--transition-fast);
  }
  .swatch:hover {
    border-color: var(--color-plum);
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
    color: var(--color-text-subtle);
    cursor: pointer;
    padding: var(--space-1);
    border-radius: var(--radius-full);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition: color var(--transition-fast), background var(--transition-fast);
  }
  .remove-btn:hover {
    color: var(--color-danger);
    background: var(--color-danger-bg);
  }
  .remove-btn:disabled {
    opacity: 0.25;
    cursor: default;
  }
  .remove-btn:disabled:hover {
    color: var(--color-text-subtle);
    background: transparent;
  }

  .add-row {
    background: transparent;
    border: none;
    border-bottom: none;
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

  /* ==================== HOLIDAYS ==================== */

  .holiday-toggles {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    margin-bottom: var(--space-3);
  }

  .holiday-list {
    display: flex;
    flex-direction: column;
    gap: 0;
    margin-bottom: var(--space-2);
  }

  .holiday-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) 0;
    border-bottom: 1px solid var(--color-border);
  }
  .holiday-row:last-child {
    border-bottom: none;
  }
  .holiday-hidden {
    opacity: 0.5;
  }

  .holiday-badge-preview {
    display: inline-block;
    font-size: 0.6875rem;
    font-weight: 600;
    color: #b45309;
    background: #fef3c7;
    border: 1px solid #fcd34d;
    border-radius: var(--radius-full);
    padding: 0 var(--space-2);
    line-height: 1.6;
    white-space: nowrap;
  }

  .holiday-date {
    font-size: 0.75rem;
    color: var(--color-text-muted);
    flex: 1;
  }

  .holiday-source {
    font-size: 0.5625rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--color-text-subtle);
    padding: var(--space-1) var(--space-2);
  }

  .holiday-add-form {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) 0;
  }

  .holiday-add-date,
  .holiday-add-name {
    font: inherit;
    font-size: 0.8125rem;
    padding: var(--space-1) var(--space-2);
    border: 1px solid var(--color-border-strong);
    border-radius: var(--radius-sm);
    background: var(--color-surface);
    color: var(--color-text);
  }

  .holiday-add-name {
    flex: 1;
  }

  /* ==================== MOCKUP TAB ==================== */

  .mockup-list {
    display: flex;
    flex-direction: column;
    gap: 0;
  }

  .mockup-card {
    border-bottom: 1px solid var(--color-border);
  }
  .mockup-card:last-child {
    border-bottom: none;
  }

  .mockup-toolbar {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin-bottom: var(--space-2);
  }

  .mockup-toggle-group {
    display: flex;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    overflow: hidden;
  }

  .mockup-toggle-labeled {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    padding: var(--space-1) var(--space-2);
    border: none;
    background: transparent;
    color: var(--color-text-muted);
    font: inherit;
    font-size: 0.625rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    cursor: pointer;
    transition: color var(--transition-fast), background var(--transition-fast);
  }
  .mockup-toggle-labeled:first-child {
    border-right: 1px solid var(--color-border);
  }
  .mockup-toggle-labeled:hover {
    color: var(--color-plum);
    background: var(--color-bg-alt);
  }

  .mockup-card-row {
    display: flex;
    align-items: center;
    gap: 0;
  }

  .mockup-reorder {
    display: flex;
    flex-direction: column;
    gap: 1px;
    flex-shrink: 0;
    opacity: 0.3;
    transition: opacity var(--transition-fast);
  }
  .mockup-card:hover .mockup-reorder {
    opacity: 1;
  }

  .mockup-reorder-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.25rem;
    height: 0.75rem;
    padding: 0;
    border: none;
    border-radius: 2px;
    background: transparent;
    color: var(--color-text-subtle);
    cursor: pointer;
    transition: color var(--transition-fast), background var(--transition-fast);
  }
  .mockup-reorder-btn:hover:not(:disabled) {
    color: var(--color-plum);
    background: var(--color-bg-alt);
  }
  .mockup-reorder-btn:disabled {
    opacity: 0.2;
    cursor: default;
  }

  .mockup-card-main {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    flex: 1;
    min-width: 0;
    padding: var(--space-3) var(--space-1);
    background: transparent;
    border: none;
    cursor: pointer;
    text-align: left;
    font: inherit;
    border-radius: var(--radius-sm);
    transition: background var(--transition-fast);
  }
  .mockup-card-main:hover {
    background: var(--color-bg-alt);
  }

  .mockup-dot {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    border: 2px solid var(--color-border);
    flex-shrink: 0;
    cursor: pointer;
    padding: 0;
    transition: border-color var(--transition-fast);
  }
  .mockup-dot:hover {
    border-color: var(--color-plum);
  }

  .mockup-name-block {
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
    flex: 1;
  }

  .mockup-name-line {
    display: flex;
    align-items: baseline;
    gap: var(--space-2);
    min-width: 0;
  }

  .mockup-name {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--color-text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .mockup-character {
    font-size: 0.6875rem;
    color: var(--color-text-muted);
    font-style: italic;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .mockup-meta-pills {
    display: flex;
    gap: var(--space-1);
    flex-shrink: 0;
  }

  .mockup-pill {
    font-size: 0.625rem;
    font-weight: 600;
    padding: 2px var(--space-2);
    border-radius: var(--radius-full);
    background: var(--color-bg-alt);
    color: var(--color-text-muted);
    white-space: nowrap;
  }

  .mockup-pill-warn {
    background: var(--color-warning-bg);
    color: var(--color-warning);
  }

  .mockup-chevron {
    font-size: 0.625rem;
    color: var(--color-text-subtle);
    flex-shrink: 0;
    width: 1rem;
    text-align: center;
  }

  .mockup-details {
    padding: 0 var(--space-1) var(--space-3) calc(1.25rem + 24px + var(--space-3) + var(--space-1));
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .mockup-detail-row-4 {
    display: grid;
    grid-template-columns: 3fr 2fr 3fr 4rem;
    gap: var(--space-2);
  }

  .mockup-detail-row-3 {
    display: grid;
    grid-template-columns: 1fr 1.5fr 1fr;
    gap: var(--space-2);
  }

  .mockup-detail-row-1 {
    display: grid;
    grid-template-columns: 1fr;
    gap: var(--space-2);
  }

  .mockup-detail-item {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
    overflow: hidden;
  }

  .mockup-detail-label {
    font-size: 0.625rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--color-text-subtle);
  }

  .mockup-conflicts {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .mockup-conflict-tags {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
  }

  .mockup-conflict-tag {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    font-size: 0.6875rem;
    padding: 2px var(--space-2);
    border-radius: var(--radius-full);
    background: var(--color-danger-bg);
    color: var(--color-danger);
    font-weight: 500;
  }

  .mockup-conflict-x {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 14px;
    height: 14px;
    padding: 0;
    border: none;
    border-radius: var(--radius-full);
    background: transparent;
    color: var(--color-danger);
    cursor: pointer;
    opacity: 0.5;
    transition: opacity var(--transition-fast), background var(--transition-fast);
  }
  .mockup-conflict-x:hover {
    opacity: 1;
    background: rgba(220, 38, 38, 0.15);
  }

  .mockup-card-actions {
    display: flex;
    gap: var(--space-2);
    padding-top: var(--space-1);
  }

  .mockup-action-btn {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    font: inherit;
    font-size: 0.6875rem;
    font-weight: 600;
    padding: var(--space-1) var(--space-2);
    border: none;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--color-text-muted);
    cursor: pointer;
    transition: color var(--transition-fast), background var(--transition-fast);
  }
  .mockup-action-btn:hover {
    color: var(--color-teal);
    background: var(--color-bg-alt);
  }
  .mockup-action-danger:hover {
    color: var(--color-danger);
    background: var(--color-danger-bg);
  }

  /* CSV Import */
  .section-header-actions {
    display: flex;
    gap: var(--space-2);
    align-items: center;
    flex-shrink: 0;
  }
  .ghost-btn-outline {
    background: transparent;
    color: var(--color-plum);
    border: 1px solid var(--color-plum);
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }
  .ghost-btn-outline:hover {
    background: var(--color-plum);
    color: var(--color-text-inverse);
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    border: 0;
  }

  .csv-import-panel {
    background: var(--color-bg-alt);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    padding: var(--space-4);
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }
  .csv-import-panel h4 {
    margin: 0;
    font-size: 0.85rem;
    font-weight: 700;
  }
  .csv-import-header .hint {
    margin: var(--space-1) 0 0;
  }

  .csv-mapping-table {
    display: flex;
    flex-direction: column;
    gap: 0;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    overflow: hidden;
  }
  .csv-mapping-row {
    display: grid;
    grid-template-columns: 1fr 1fr 140px;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    align-items: center;
    border-bottom: 1px solid var(--color-border);
    font-size: 0.8rem;
  }
  .csv-mapping-row:last-child {
    border-bottom: none;
  }
  .csv-mapping-header-row {
    background: var(--color-bg);
    font-weight: 700;
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    color: var(--color-text-muted);
  }
  .csv-mapping-col-name,
  .csv-mapping-col-sample {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .csv-mapping-col-sample {
    color: var(--color-text-muted);
  }
  .csv-mapping-select {
    font-size: 0.8rem;
    padding: 2px 4px;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: var(--color-bg);
  }

  .csv-preview-section {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .csv-preview-section h4 {
    font-size: 0.8rem;
    color: var(--color-text-muted);
  }
  .csv-preview-scroll {
    overflow-x: auto;
  }
  .csv-preview-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.75rem;
  }
  .csv-preview-table th {
    background: var(--color-bg);
    font-weight: 700;
    text-align: left;
    padding: var(--space-1) var(--space-2);
    border-bottom: 1px solid var(--color-border);
    white-space: nowrap;
  }
  .csv-preview-table td {
    padding: var(--space-1) var(--space-2);
    border-bottom: 1px solid var(--color-border);
    white-space: nowrap;
    max-width: 160px;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .csv-import-mode {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    font-size: 0.8rem;
  }
  .csv-import-mode-label {
    font-weight: 600;
    margin-bottom: var(--space-1);
  }
  .csv-radio-label {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    cursor: pointer;
  }
  .csv-radio-label input[type="radio"] {
    margin: 0;
  }

  .csv-import-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2);
    padding-top: var(--space-2);
    border-top: 1px solid var(--color-border);
  }
  .csv-cancel-btn {
    background: transparent;
    border: 1px solid var(--color-border);
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-sm);
    font-size: 0.75rem;
    cursor: pointer;
  }
  .csv-cancel-btn:hover {
    background: var(--color-bg-alt);
  }

  .csv-result-banner {
    background: #e8f5e9;
    border: 1px solid #a5d6a7;
    border-radius: var(--radius-sm);
    padding: var(--space-3);
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-3);
    font-size: 0.8rem;
  }
  .csv-result-content strong {
    display: block;
    margin-bottom: var(--space-1);
  }
  .csv-result-list {
    margin: 0;
    padding-left: var(--space-4);
  }
  .csv-result-detail {
    color: var(--color-text-muted);
    font-size: 0.75rem;
    list-style: none;
    padding-left: var(--space-2);
  }
  .csv-result-dismiss {
    background: transparent;
    border: 1px solid #a5d6a7;
    padding: var(--space-1) var(--space-2);
    border-radius: var(--radius-sm);
    font-size: 0.7rem;
    cursor: pointer;
    white-space: nowrap;
    flex-shrink: 0;
  }
  .csv-result-dismiss:hover {
    background: #c8e6c9;
  }
</style>
