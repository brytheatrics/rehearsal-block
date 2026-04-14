<script lang="ts">
  import CalendarGrid from "$lib/components/scheduler/CalendarGrid.svelte";
  import ListView from "$lib/components/scheduler/ListView.svelte";
  import Sidebar from "$lib/components/scheduler/Sidebar.svelte";
  import DayToolSidebar from "$lib/components/scheduler/DayToolSidebar.svelte";
  import DayEditor from "$lib/components/scheduler/DayEditor.svelte";
  import DefaultsModal from "$lib/components/scheduler/DefaultsModal.svelte";
  import CastEditorModal from "$lib/components/scheduler/CastEditorModal.svelte";
  import DateEditorModal from "$lib/components/scheduler/DateEditorModal.svelte";
  import ExportModal from "$lib/components/scheduler/ExportModal.svelte";
  import ContactSheetModal from "$lib/components/scheduler/ContactSheetModal.svelte";
  import ConflictRequestModal from "$lib/components/scheduler/ConflictRequestModal.svelte";
  import ShowEditorModal from "$lib/components/scheduler/ShowEditorModal.svelte";
  import Toast from "$lib/components/scheduler/Toast.svelte";
  import { onMount } from "svelte";
  import type {
    Call,
    CastDisplayMode,
    CastMember,
    Conflict,
    CrewMember,
    EventType,
    Group,
    IsoDate,
    ScheduleDay,
    ScheduleDoc,
    Settings,
    Show,
  } from "@rehearsal-block/core";
  import { getDefaultCallTimes, downloadCsv, openPrintWindow, weekStartOf, eachDayOfRange, parseIsoDate, addDays, formatUsDateRange, blockingConflictsFor } from "@rehearsal-block/core";
  import { publishSchedule, buildShareUrlFromId } from "$lib/share";

  interface Props {
    initialDoc: ScheduleDoc;
    readOnly?: boolean;
    onSave?: (doc: ScheduleDoc) => Promise<void>;
    onPaywall?: () => void;
    onDocChange?: (doc: ScheduleDoc) => void;
    showDemoBanners?: boolean;
    /** Cloud sync status. Drives the Save button indicator. */
    syncStatus?: "synced" | "pending" | "syncing" | "error" | "offline";
    /** When true, show a teal "reset" icon in the toolbar. Clicking it
     *  fires onReset. Used by signed-in demo to let users wipe their edits. */
    showResetButton?: boolean;
    onReset?: () => void;
    /** When provided, shows a "Version history" icon in the toolbar
     *  next to Save. Clicking it fires onHistory. */
    onHistory?: () => void;
  }

  const { initialDoc, readOnly = false, onSave, onPaywall, onDocChange, showDemoBanners = false, syncStatus = "synced", showResetButton = false, onReset, onHistory }: Props = $props();

  // Deep-clone so mutations during editing don't touch the caller's object.
  // svelte-ignore state_referenced_locally
  let doc = $state<ScheduleDoc>(structuredClone(initialDoc));

  // Notify parent of doc changes for auto-save (paid mode).
  // Uses JSON serialization to detect real changes and avoid
  // firing on the initial mount or reactive proxy shuffles.
  let lastNotifiedJson = "";
  $effect(() => {
    const json = JSON.stringify(doc);
    if (lastNotifiedJson && json !== lastNotifiedJson) {
      onDocChange?.(doc);
    }
    lastNotifiedJson = json;
  });

  // ------------------------------------------------------------------
  // Undo / Redo
  // ------------------------------------------------------------------
  const MAX_HISTORY = 50;
  let undoStack = $state<string[]>([]);
  let redoStack = $state<string[]>([]);
  /** Debounce timer so rapid keystrokes (typing in an input) collapse
   *  into a single history entry instead of one per character. */
  let snapshotTimer: ReturnType<typeof setTimeout> | null = null;
  /** True while we're restoring a snapshot - prevents the $effect from
   *  pushing the restored state back onto the undo stack. */
  let restoringSnapshot = false;

  /** Serialize the current doc for the history stack. */
  function snap(): string {
    return JSON.stringify(doc);
  }

  /**
   * Call this before every user mutation. Captures the current state so
   * the user can get back to it. Debounced at 500ms so fast typing in
   * inputs and time pickers doesn't flood the stack.
   */
  function pushUndo() {
    if (restoringSnapshot) return;
    if (snapshotTimer) clearTimeout(snapshotTimer);
    const before = snap();
    snapshotTimer = setTimeout(() => {
      // Only push if something actually changed since the last entry.
      if (undoStack.length > 0 && undoStack[undoStack.length - 1] === before) {
        return;
      }
      undoStack = [...undoStack.slice(-(MAX_HISTORY - 1)), before];
      // Any new edit kills the redo future.
      redoStack = [];
      snapshotTimer = null;
    }, 500);
  }

  /** Push immediately (no debounce). Used for discrete actions like
   *  clear day, remove conflict, drag-drop - things that aren't fast
   *  repeated keystrokes. */
  function pushUndoImmediate() {
    if (restoringSnapshot) return;
    if (snapshotTimer) {
      clearTimeout(snapshotTimer);
      snapshotTimer = null;
    }
    const before = snap();
    if (undoStack.length > 0 && undoStack[undoStack.length - 1] === before) {
      return;
    }
    undoStack = [...undoStack.slice(-(MAX_HISTORY - 1)), before];
    redoStack = [];
  }

  function undo() {
    if (undoStack.length === 0) return;
    const current = snap();
    redoStack = [...redoStack, current];
    const prev = undoStack[undoStack.length - 1]!;
    undoStack = undoStack.slice(0, -1);
    restoringSnapshot = true;
    doc = JSON.parse(prev) as ScheduleDoc;
    restoringSnapshot = false;
  }

  function redo() {
    if (redoStack.length === 0) return;
    const current = snap();
    undoStack = [...undoStack, current];
    const next = redoStack[redoStack.length - 1]!;
    redoStack = redoStack.slice(0, -1);
    restoringSnapshot = true;
    doc = JSON.parse(next) as ScheduleDoc;
    restoringSnapshot = false;
  }

  const canUndo = $derived(undoStack.length > 0);
  const canRedo = $derived(redoStack.length > 0);

  let selectedDate = $state<IsoDate | null>(null);
  let selectedDates = $state<Set<IsoDate>>(new Set());
  /**
   * Draft ScheduleDay for blank cells the user just opened. We don't
   * auto-commit these to `doc.schedule` - otherwise cancelling out of a
   * blank cell would leave behind a phantom day with `firstType` as its
   * eventTypeId, which would (a) paint a stray Rehearsal badge on the
   * grid and (b) make the Defaults mini-calendar think the day was
   * assigned. Any real edit through `updateSelectedDay` promotes the
   * draft into `doc.schedule`.
   */
  let draftDay = $state<ScheduleDay | null>(null);
  // readOnly removed - parent handles paywall UI via onPaywall callback
  let defaultsOpen = $state(false);
  let castEditorOpen = $state(false);
  let showEditorOpen = $state(false);
  let dateEditorOpen = $state(false);
  let exportOpen = $state(false);
  let printOpen = $state(false);
  let contactSheetOpen = $state(false);
  let conflictRequestOpen = $state(false);
  /** How many pending conflict submissions are sitting in localStorage
   *  under this show's token. Drives the toolbar icon's needs-attention
   *  teal state, matching the Share button pattern. */
  let pendingConflictCount = $state(0);
  /** Mobile preferences hydration flag. Guards the persistence effect
   *  so it doesn't overwrite stored prefs with default values on mount
   *  before `onMount` has a chance to load them. Flipped to true by
   *  `onMount` after it reads localStorage. */
  let mobilePrefsHydrated = $state(false);
  const MOBILE_PREFS_KEY = "rehearsal-block:mobile-prefs";
  /** Whether the left sidebar (cast/team toolbar) is collapsed to
   *  a narrow strip, freeing up horizontal space for the calendar. */
  let sidebarCollapsed = $state(false);
  /** User preference for the right sidebar (day-tool palette) collapse
   *  state. The actual visible state is derived: when the day editor is
   *  open, the right sidebar is forced collapsed so the editor can take
   *  the column. Closing the editor reveals the user's preference. */
  let rightSidebarCollapsedPref = $state(false);
  /** Show text labels next to toolbar icons - accessibility feature
   *  for users who can't remember what each icon does. */
  const showToolbarLabels = $derived(doc.settings.showToolbarLabels ?? false);
  let shareId = $state<string | null>(null);
  let shareDropdownOpen = $state(false);
  let publishing = $state(false);
  let lastPublishedJson = $state("");
  /** True for a brief window after the first publish so the Copy Link
   *  button gets a visual highlight and the user can find it easily. */
  let justFirstPublished = $state(false);
  const hasUnpublishedChanges = $derived(
    shareId ? JSON.stringify(doc) !== lastPublishedJson : false,
  );
  let viewMode = $state<"calendar" | "list">("calendar");
  let dateFilterStart = $state<IsoDate | "">("");
  let dateFilterEnd = $state<IsoDate | "">("");
  /** Unified filter dropdown state - a single panel with Date, Person,
   *  Event Type, and Location sections. Replaces the old date-only
   *  filter dropdown. */
  let dateFilterOpen = $state(false);
  let filterPersonIds = $state<Set<string>>(new Set());
  let filterEventTypeIds = $state<Set<string>>(new Set());
  let filterLocationNames = $state<Set<string>>(new Set());
  /** Per-section expand/collapse state for the filter dropdown.
   *  Collapsed by default so the dropdown stays short on small
   *  screens; sections with active filters auto-expand when the
   *  dropdown opens (see `$effect` below). */
  let filterDateExpanded = $state(false);
  let filterPersonExpanded = $state(false);
  let filterEventTypeExpanded = $state(false);
  let filterLocationExpanded = $state(false);
  const hasDateFilter = $derived(!!(dateFilterStart || dateFilterEnd));
  const hasPersonFilter = $derived(filterPersonIds.size > 0);
  const hasEventTypeFilter = $derived(filterEventTypeIds.size > 0);
  const hasLocationFilter = $derived(filterLocationNames.size > 0);
  const hasAnyFilter = $derived(
    hasDateFilter || hasPersonFilter || hasEventTypeFilter || hasLocationFilter,
  );

  /** Effective filter range: combines scope + manual filter. Scope takes priority. */
  const effectiveFilterStart = $derived.by<IsoDate | undefined>(() => {
    if (scopeMode !== "auto") return scopeRange.start;
    return dateFilterStart || undefined;
  });
  const effectiveFilterEnd = $derived.by<IsoDate | undefined>(() => {
    if (scopeMode !== "auto") return scopeRange.end;
    return dateFilterEnd || undefined;
  });

  /**
   * Set of dates excluded by person/event-type/location filters. A date
   * is in the set if it FAILS at least one of those filters. Date range
   * filtering is handled separately via filterStart/filterEnd, so this
   * set only covers the three non-range filters.
   *
   * Empty set when no non-range filters are active.
   */
  const filterExcludedDates = $derived.by<Set<string>>(() => {
    const excluded = new Set<string>();
    if (!hasPersonFilter && !hasEventTypeFilter && !hasLocationFilter) {
      return excluded;
    }
    for (const [date, day] of Object.entries(doc.schedule)) {
      if (!day) continue;

      // Person filter: day must have at least one filtered person called
      if (hasPersonFilter) {
        const calledIds = new Set<string>();
        for (const call of day.calls ?? []) {
          for (const id of call.calledActorIds ?? []) calledIds.add(id);
          for (const id of call.calledCrewIds ?? []) calledIds.add(id);
          if (call.allCalled) {
            for (const m of doc.cast) calledIds.add(m.id);
          }
          for (const gid of call.calledGroupIds ?? []) {
            const g = doc.groups.find((x) => x.id === gid);
            if (g) for (const id of g.memberIds) calledIds.add(id);
          }
        }
        const personMatches = [...filterPersonIds].some((id) => calledIds.has(id));
        if (!personMatches) {
          excluded.add(date);
          continue;
        }
      }

      // Event type filter: day's eventTypeId must be in the filter set
      if (hasEventTypeFilter) {
        if (!day.eventTypeId || !filterEventTypeIds.has(day.eventTypeId)) {
          excluded.add(date);
          continue;
        }
      }

      // Location filter: at least one call's location (or day-level
      // fallback) must be in the filter set.
      if (hasLocationFilter) {
        const dayLoc = (day.location || "").trim();
        const callLocs = (day.calls ?? [])
          .map((c) => (c.location || dayLoc).trim())
          .filter(Boolean);
        const locMatches = callLocs.some((l) => filterLocationNames.has(l));
        if (!locMatches) {
          excluded.add(date);
          continue;
        }
      }
    }

    // Any date with NO schedule entry is also excluded when any of
    // these filters are active (otherwise empty days would always show).
    if (hasPersonFilter || hasEventTypeFilter || hasLocationFilter) {
      const startDate = doc.show.startDate;
      const endDate = doc.show.endDate;
      for (
        let d = new Date(startDate + "T00:00:00Z");
        d <= new Date(endDate + "T00:00:00Z");
        d.setUTCDate(d.getUTCDate() + 1)
      ) {
        const iso = d.toISOString().slice(0, 10);
        if (!doc.schedule[iso] && !excluded.has(iso)) {
          excluded.add(iso);
        }
      }
    }

    return excluded;
  });

  function clearAllFilters() {
    dateFilterStart = "";
    dateFilterEnd = "";
    filterPersonIds = new Set();
    filterEventTypeIds = new Set();
    filterLocationNames = new Set();
  }

  /**
   * When the filter dropdown opens, auto-expand any section that has
   * an active filter so the user can see what's currently applied.
   * Sections without active filters stay collapsed to save space.
   */
  $effect(() => {
    if (!dateFilterOpen) return;
    if (hasDateFilter) filterDateExpanded = true;
    if (hasPersonFilter) filterPersonExpanded = true;
    if (hasEventTypeFilter) filterEventTypeExpanded = true;
    if (hasLocationFilter) filterLocationExpanded = true;
  });

  function togglePersonFilter(id: string) {
    const next = new Set(filterPersonIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    filterPersonIds = next;
  }

  function toggleEventTypeFilter(id: string) {
    const next = new Set(filterEventTypeIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    filterEventTypeIds = next;
  }

  function toggleLocationFilter(name: string) {
    const next = new Set(filterLocationNames);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    filterLocationNames = next;
  }

  // Scope selector: Auto (full range), Month, Week, Day
  type ScopeMode = "auto" | "month" | "week" | "day";
  let scopeMode = $state<ScopeMode>("auto");
  let scopeAnchor = $state<IsoDate>("" as IsoDate); // current position for month/week/day

  // Initialize anchor to show start date
  $effect(() => {
    if (!scopeAnchor || scopeAnchor < doc.show.startDate || scopeAnchor > doc.show.endDate) {
      scopeAnchor = doc.show.startDate;
    }
  });

  /** Compute the visible date range for the current scope. */
  const scopeRange = $derived.by<{ start: IsoDate; end: IsoDate }>(() => {
    if (scopeMode === "auto") {
      return { start: doc.show.startDate, end: doc.show.endDate };
    }
    const anchor = scopeAnchor || doc.show.startDate;
    const d = parseIsoDate(anchor);
    if (scopeMode === "month") {
      const year = d.getUTCFullYear();
      const month = d.getUTCMonth();
      const first = `${year}-${String(month + 1).padStart(2, "0")}-01` as IsoDate;
      const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
      const last = `${year}-${String(month + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}` as IsoDate;
      // Clamp to show range
      return {
        start: (first < doc.show.startDate ? doc.show.startDate : first) as IsoDate,
        end: (last > doc.show.endDate ? doc.show.endDate : last) as IsoDate,
      };
    }
    if (scopeMode === "week") {
      const ws = weekStartOf(anchor, doc.settings.weekStartsOn);
      const we = addDays(ws, 6);
      return {
        start: (ws < doc.show.startDate ? doc.show.startDate : ws) as IsoDate,
        end: (we > doc.show.endDate ? doc.show.endDate : we) as IsoDate,
      };
    }
    // day
    return { start: anchor, end: anchor };
  });

  function scopeNav(direction: -1 | 1) {
    const d = parseIsoDate(scopeAnchor || doc.show.startDate);
    if (scopeMode === "month") {
      d.setUTCMonth(d.getUTCMonth() + direction);
    } else if (scopeMode === "week") {
      d.setUTCDate(d.getUTCDate() + direction * 7);
    } else if (scopeMode === "day") {
      // Navigate to prev/next day that has content
      const allDates = eachDayOfRange(doc.show.startDate, doc.show.endDate);
      const curIdx = allDates.indexOf(scopeAnchor);
      const nextIdx = curIdx + direction;
      if (nextIdx >= 0 && nextIdx < allDates.length) {
        scopeAnchor = allDates[nextIdx]!;
        return;
      }
      return;
    }
    const iso = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}` as IsoDate;
    // Clamp
    if (iso < doc.show.startDate) { scopeAnchor = doc.show.startDate; return; }
    if (iso > doc.show.endDate) { scopeAnchor = doc.show.endDate; return; }
    scopeAnchor = iso;
  }

  /** Human-readable label for the current scope position. */
  const scopeLabel = $derived.by(() => {
    if (scopeMode === "auto") return "";
    const d = parseIsoDate(scopeAnchor || doc.show.startDate);
    const monthNames = ["January","February","March","April","May","June","July","August","September","October","November","December"];
    if (scopeMode === "month") return `${monthNames[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
    if (scopeMode === "week") {
      const ws = weekStartOf(scopeAnchor || doc.show.startDate, doc.settings.weekStartsOn);
      const we = addDays(ws, 6);
      const fmt = (iso: IsoDate) => new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
      return `${fmt(ws)} - ${fmt(we)}`;
    }
    return new Date((scopeAnchor || doc.show.startDate) + "T00:00:00Z").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
  });

  /* Scroll the page to the very top whenever the user picks a new
     scope (Overview / Month / Week / Day). The previous logic tried
     to be clever - position the calendar's top at the bottom of the
     sticky bar so the show title stayed visible - but that left the
     page two scroll-clicks below the actual top, which felt like the
     view was misaligned. Going all the way to (0, 0) is what users
     expect when switching modes, and now Overview gets the same
     treatment as the other three scopes. */
  $effect(() => {
    // Reference scopeMode to track changes
    const _mode = scopeMode;
    void _mode;
    queueMicrotask(() => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  });

  // Inline editing state
  interface InlineEditState {
    date: IsoDate;
    callId?: string;
    field: "description" | "time" | "endTime" | "notes";
  }
  let inlineEdit = $state<InlineEditState | null>(null);

  /** Guard: skip the next window-click commit (set when inline edit starts). */
  let inlineEditJustStarted = false;

  function startInlineEdit(date: IsoDate, field: InlineEditState["field"], callId?: string) {
    // Ensure the day is selected first
    if (selectedDate !== date) {
      selectedDates = new Set();
      if (doc.schedule[date]) {
        draftDay = null;
      } else {
        draftDay = emptyDay(date);
      }
      selectedDate = date;
    }
    inlineEdit = { date, callId, field };
    // Prevent the window click handler (which runs after this) from
    // immediately committing the inline edit we just started.
    inlineEditJustStarted = true;
    queueMicrotask(() => { inlineEditJustStarted = false; });
  }

  function commitInlineEdit() {
    inlineEdit = null;
    // Also deselect so the DayEditor doesn't flash open between
    // committing one inline edit and starting another.
    selectedDate = null;
    draftDay = null;
  }

  function cancelInlineEdit() {
    inlineEdit = null;
    selectedDate = null;
    draftDay = null;
  }

  function inlineChange(patch: Partial<ScheduleDay>) {
    if (!inlineEdit) return;
    updateSelectedDay(patch);
  }

  function inlineCallChange(callId: string, callPatch: Partial<Call>) {
    if (!inlineEdit || !selectedDate) return;
    const day = doc.schedule[selectedDate] ?? draftDay;
    if (!day) return;
    const next = day.calls.map((c) =>
      c.id === callId ? { ...c, ...callPatch } : c,
    );
    updateSelectedDay({ calls: next });
  }

  let stickyBarEl = $state<HTMLDivElement | null>(null);

  // Set --sticky-bar-height CSS variable so child sticky elements
  // (weekday headers) can position below the toolbar.
  $effect(() => {
    if (!stickyBarEl) return;
    const update = () => {
      const h = stickyBarEl!.getBoundingClientRect().height;
      stickyBarEl!.parentElement?.style.setProperty("--sticky-bar-height", h + "px");
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(stickyBarEl);
    return () => ro.disconnect();
  });

  let scopeDropdownOpen = $state(false);
  let exportDropdownOpen = $state(false);
  let csvPickerOpen = $state(false);
  let csvEndTimeWarningOpen = $state(false);
  let printPickerOpen = $state(false);
  let clearConfirmOpen = $state(false);
  let conflictToDelete = $state<Conflict | null>(null);
  /** Toggled by . and , hotkeys to collapse/expand all call cards in
   *  the editor. undefined = no external toggle in progress; true/false
   *  triggers the DayEditor's $effect. Resets to undefined after the
   *  editor processes it so the same key can fire again. */
  let editorAllCollapsed = $state<boolean | undefined>(undefined);

  // --- Clipboard + Copy/Move/Paste ----------------------------------
  let clipboard = $state<{ day: ScheduleDay; sourceDate: IsoDate; isCut: boolean } | null>(null);
  let toastMessage = $state("");
  /** When pasting onto one or more days that already have content, this
   *  state drives the Replace/Merge/Cancel modal. `targetDates` always
   *  holds at least one ISO date; multi-day paste routes here too when
   *  any of the selected targets have existing content. */
  let pasteConflict = $state<{
    targetDates: IsoDate[];
    day: ScheduleDay;
    isCut: boolean;
    sourceDate: IsoDate;
  } | null>(null);

  /**
   * The ScheduleDay the editor renders: prefer the committed entry if
   * one exists, otherwise fall back to the in-memory draft so the user
   * sees weekday-default times and the default location immediately
   * when opening a blank cell.
   */
  const selectedDay = $derived<ScheduleDay | null>(
    selectedDate
      ? (doc.schedule[selectedDate] ?? draftDay)
      : null,
  );

  /** True when the right-side day editor is rendered. The right tool
   *  sidebar yields its grid column to the editor while this is true. */
  const dayEditorOpen = $derived(!!(selectedDate && selectedDay && !inlineEdit));
  /** Visible collapse state for the right tool sidebar. Forced collapsed
   *  while the day editor is open; otherwise reflects the user's preference. */
  const rightSidebarCollapsed = $derived(dayEditorOpen ? true : rightSidebarCollapsedPref);

  /**
   * Seed a blank ScheduleDay for days the user hasn't touched yet. Uses
   * the show's per-weekday time defaults: enabled weekdays get a pre-
   * filled call at the configured times; disabled weekdays start with
   * zero calls so the director has to add one manually (matches the
   * "dark until you set a time" UX hint in the Defaults modal).
   */
  /**
   * Day shell for drag-drop creation. Differs from `emptyDay` in two
   * critical ways:
   * 1. No `eventTypeId` unless `Settings.defaultEventType` is set. We
   *    don't want a "Rehearsal" badge to materialize just because the
   *    user dropped a Description on a blank day.
   * 2. No auto-calls from weekday defaults. `emptyDay` seeds a single
   *    call from the weekday's default times, which is great when the
   *    user explicitly clicks a day to schedule it - but for chip
   *    drops it's a footgun. The empty seeded call is invisible until
   *    `day.description` becomes non-empty (`isCallPopulated` treats
   *    day-level description as content for every call), at which
   *    point a phantom time block appears. Description / Note /
   *    Location drops should leave calls empty; only the explicit
   *    Call chip should add a call.
   */
  function dropShell(iso: IsoDate): ScheduleDay {
    const defaultType = doc.settings.defaultEventType;
    const eventTypeId = (defaultType && doc.eventTypes.some(et => et.id === defaultType))
      ? defaultType
      : "";
    return {
      eventTypeId,
      calls: [],
      description: "",
      notes: "",
      location: doc.settings.defaultLocation ?? "",
    };
  }

  function emptyDay(iso: IsoDate): ScheduleDay {
    const weekdayTimes = getDefaultCallTimes(doc.settings, iso);
    const calls = weekdayTimes
      ? [
          {
            id: `call_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            label: "",
            time: weekdayTimes.startTime,
            endTime: weekdayTimes.endTime,
            calledActorIds: [],
            calledGroupIds: [],
          },
        ]
      : [];
    /* Only auto-assign an event type if the user has explicitly set one
       as the show-wide default in Settings > Schedule. We deliberately
       do NOT fall back to `eventTypes[0]` (the first item, often
       "Rehearsal") because that surprises users who haven't picked a
       default - they'd see Rehearsal selected on every blank cell with
       no idea why. Match the same logic dropShell() uses. */
    const defaultType = doc.settings.defaultEventType;
    const eventTypeId =
      defaultType && doc.eventTypes.some((et) => et.id === defaultType)
        ? defaultType
        : "";
    return {
      eventTypeId,
      calls,
      description: "",
      notes: "",
      location: doc.settings.defaultLocation ?? "",
    };
  }

  function selectDay(iso: IsoDate, shiftKey?: boolean, ctrlKey?: boolean) {
    if (shiftKey && selectedDate && selectedDate !== iso) {
      // Shift-click: select a range from the last selected date to this one
      const allDates = eachDayOfRange(doc.show.startDate, doc.show.endDate);
      const startIdx = allDates.indexOf(selectedDate);
      const endIdx = allDates.indexOf(iso);
      if (startIdx >= 0 && endIdx >= 0) {
        const lo = Math.min(startIdx, endIdx);
        const hi = Math.max(startIdx, endIdx);
        selectedDates = new Set(allDates.slice(lo, hi + 1));
      }
      return;
    }

    if (ctrlKey) {
      // Ctrl-click: toggle individual day in the selection.
      // If this is the first Ctrl-click, include the currently
      // selected day so it becomes part of the multi-selection.
      const next = new Set(selectedDates);
      if (next.size === 0 && selectedDate) {
        next.add(selectedDate);
      }
      if (next.has(iso)) {
        next.delete(iso);
      } else {
        next.add(iso);
      }
      selectedDates = next;
      return;
    }

    // Normal click: clear multi-select, open the editor
    selectedDates = new Set();
    if (doc.schedule[iso]) {
      draftDay = null;
    } else {
      draftDay = emptyDay(iso);
    }
    selectedDate = iso;
  }

  function closeEditor() {
    selectedDate = null;
    // Discard any uncommitted draft when the editor closes.
    draftDay = null;
  }

  /** Open the confirmation modal asking the user to clear day(s). */
  function requestClearDay() {
    if (!selectedDate && selectedDates.size === 0) return;
    clearConfirmOpen = true;
  }

  /** The dates that will be cleared - either multi-select or just the single selected day. */
  const clearTargetDates = $derived.by(() => {
    if (selectedDates.size > 0) return [...selectedDates].sort();
    if (selectedDate) return [selectedDate];
    return [];
  });

  /**
   * Wipe the day's content. Behavior depends on ownership:
   * - If the date is in `defaultsAssignedDates` (came from the Defaults
   *   mini-calendar picker), the badge and the defaults assignment are
   *   preserved. Calls, description, notes, location, and called cast
   *   are all cleared so the day reads as "blank but still owned by
   *   defaults".
   * - If the date is editor-owned (the user picked a type via the editor
   *   pill and never went through the Defaults flow), the whole entry
   *   is deleted so the grid shows no badge and the mini-cal no longer
   *   lists it.
   * - If the day was only a transient draft from clicking a blank cell
   *   (never committed to doc.schedule), just discard the draft.
   *
   * Conflicts live on `doc.conflicts` keyed by date at the doc level and
   * are ALWAYS untouched - the user's real-world scheduling obstacles
   * shouldn't disappear when they reset a day's content.
   */
  function performClearDay() {
    const targets = clearTargetDates;
    if (targets.length === 0) return;
    pushUndoImmediate();

    const next = { ...doc.schedule };
    for (const iso of targets) {
      const existing = next[iso];
      if (!existing) continue;
      if (isInDefaults(iso)) {
        next[iso] = {
          eventTypeId: existing.eventTypeId,
          calls: [],
          description: "",
          notes: "",
          location: "",
        };
      } else {
        delete next[iso];
      }
    }
    doc.schedule = next;

    // Clean up state
    draftDay = null;
    if (targets.length > 1) {
      selectedDates = new Set();
    }
    clearConfirmOpen = false;
  }

  function cancelClearDay() {
    clearConfirmOpen = false;
  }

  /**
   * Close-on-outside-click for the day editor. Fires when the user clicks
   * anywhere that isn't (a) the editor itself or (b) a day cell, because
   * clicking another cell should retarget the editor, not dismiss it. The
   * defaults + paywall modals handle their own dismissal, so we bail out
   * while they're open to avoid double-closing.
   *
   * We walk `event.composedPath()` instead of `target.closest(...)`.
   * Reason: any button inside the editor that mutates state (a TimePicker
   * option, "+ Add Call", the ✎ remove on a chip, etc.) triggers a Svelte
   * re-render which can remove the clicked element from the DOM BEFORE
   * this window handler runs. At that point `closest` walks an orphaned
   * parent chain and returns null, making it look like the click was
   * outside the editor. `composedPath()` captures the real DOM path at
   * event-dispatch time, so transient elements stay matchable.
   */
  function onWindowClick(e: MouseEvent) {
    // Close dropdowns on any outside click
    if (exportDropdownOpen) exportDropdownOpen = false;
    if (shareDropdownOpen) shareDropdownOpen = false;
    if (dateFilterOpen) dateFilterOpen = false;
    if (scopeDropdownOpen) scopeDropdownOpen = false;
    if (inlineEdit && !inlineEditJustStarted) {
      // Don't commit if the click was inside an inline editor element
      const path = (e.composedPath?.() ?? [e.target]) as EventTarget[];
      const clickedInline = path.some((n) =>
        n instanceof Element && (
          n.classList?.contains("inline-desc") ||
          n.classList?.contains("inline-notes") ||
          n.classList?.contains("inline-time") ||
          n.classList?.contains("picker") ||
          n.classList?.contains("list")
        )
      );
      if (!clickedInline) commitInlineEdit();
    }
    if (!selectedDate && selectedDates.size === 0) return;
    if (defaultsOpen || readOnly || clearConfirmOpen || conflictToDelete || pasteConflict || castEditorOpen || showEditorOpen || dateEditorOpen || exportOpen)
      return;
    const path = (e.composedPath?.() ?? [e.target]) as EventTarget[];
    let clickedInteractive = false;
    for (const node of path) {
      if (!(node instanceof Element)) continue;
      if (node.classList?.contains("editor")) return;
      const aria = node.getAttribute?.("aria-label");
      if (aria && aria.startsWith("Edit ")) return; // day cells + edit ✎ buttons
      if (node.classList?.contains("backdrop")) return; // mobile editor backdrop
      // Detect whether the click landed on something interactive (a
      // button, link, form control, etc.) vs. empty whitespace. The
      // user's mental model: clicking on a real control means "I'm
      // moving on" (clear everything), while clicking empty space
      // near the grid means "just dismiss the editor, keep my
      // multi-selection so I can keep working".
      if (!clickedInteractive) {
        const tag = node.tagName;
        if (
          tag === "BUTTON" ||
          tag === "A" ||
          tag === "INPUT" ||
          tag === "SELECT" ||
          tag === "TEXTAREA" ||
          tag === "LABEL"
        ) {
          clickedInteractive = true;
        } else {
          const role = node.getAttribute?.("role");
          if (
            role === "button" ||
            role === "link" ||
            role === "menuitem" ||
            role === "checkbox" ||
            role === "radio"
          ) {
            clickedInteractive = true;
          }
        }
      }
    }
    if (clickedInteractive) {
      // Interactive click = "moving on". Close the editor and clear
      // the multi-selection in one pass.
      if (selectedDate) closeEditor();
      if (selectedDates.size > 0) selectedDates = new Set();
    } else {
      // Whitespace click = two-step, mirroring the Escape ladder:
      // 1) If the editor is open, just close it. Teal stays so the
      //    user can keep working with the multi-selection.
      // 2) Otherwise, clear the multi-selection.
      if (selectedDate) {
        closeEditor();
      } else if (selectedDates.size > 0) {
        selectedDates = new Set();
      }
    }
  }

  /**
   * True when the user is typing in a form field and keyboard shortcuts
   * should NOT hijack the key (e.g. backspace inside a textarea).
   */
  function isEditingText(): boolean {
    const el = document.activeElement as HTMLElement | null;
    if (!el) return false;
    const tag = el.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
    if (el.isContentEditable) return true;
    return false;
  }

  /** True when the user is focused inside the rich-text contenteditable
   *  notes editor. We let the browser handle Ctrl+Z there natively. */
  function isEditingRichText(): boolean {
    const el = document.activeElement as HTMLElement | null;
    return el?.isContentEditable ?? false;
  }

  /**
   * Global keyboard:
   *  - Escape closes whichever layer is on top (confirm > paywall >
   *    defaults > editor).
   *  - Backspace/Delete (with no text field focused) triggers the
   *    clear-day confirmation for the open editor.
   */
  function onWindowKey(e: KeyboardEvent) {
    // Ctrl/Cmd shortcuts (gated: not inside rich-text contenteditable).
    if ((e.ctrlKey || e.metaKey) && !isEditingRichText()) {
      // Save
      if (e.key === "s") {
        e.preventDefault();
        tryToSave();
        return;
      }
      // Undo/Redo
      if (e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
        return;
      }
      if (e.key === "y" || (e.key === "z" && e.shiftKey)) {
        e.preventDefault();
        redo();
        return;
      }
      // Clipboard: Copy/Cut/Paste a day.
      // Copy/Cut need a single selected day. Paste additionally allows
      // a multi-selection (selectedDates) as the target, so the user
      // can copy once and fan it out across many highlighted days.
      if (!isEditingText()) {
        if (selectedDate && e.key === "c") {
          e.preventDefault();
          copyDay();
          return;
        }
        if (selectedDate && e.key === "x") {
          e.preventDefault();
          cutDay();
          return;
        }
        if ((selectedDate || selectedDates.size > 0) && e.key === "v") {
          e.preventDefault();
          pasteDay();
          return;
        }
      }
    }

    // Arrow keys and PageUp/PageDown for scope navigation
    if (scopeMode !== "auto" && !isEditingText()) {
      if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        scopeNav(-1);
        return;
      }
      if (e.key === "ArrowRight" || e.key === "PageDown") {
        e.preventDefault();
        scopeNav(1);
        return;
      }
    }

    // Shift+O/M/W/D for scope views (Overview / Month / Week / Day)
    if (e.shiftKey && !e.ctrlKey && !e.metaKey && !isEditingText()) {
      const scopeKey = e.key.toUpperCase();
      if (scopeKey === "O") { e.preventDefault(); scopeMode = "auto"; return; }
      if (scopeKey === "M" || scopeKey === "W" || scopeKey === "D") {
        e.preventDefault();
        const mode = scopeKey === "M" ? "month" : scopeKey === "W" ? "week" : "day";
        scopeMode = mode;
        if (selectedDate && selectedDate >= doc.show.startDate && selectedDate <= doc.show.endDate) {
          scopeAnchor = selectedDate;
        } else if (!scopeAnchor || scopeAnchor < doc.show.startDate) {
          scopeAnchor = doc.show.startDate;
        }
        return;
      }
    }

    if (e.key === "Escape") {
      if (pasteConflict) {
        pasteConflict = null;
        return;
      }
      if (conflictToDelete) {
        conflictToDelete = null;
        return;
      }
      if (clearConfirmOpen) {
        clearConfirmOpen = false;
        return;
      }
      if (defaultsOpen) {
        defaultsOpen = false;
        return;
      }
      if (inlineEdit) {
        cancelInlineEdit();
        return;
      }
      // Two-step deselect:
      // 1) If a day is open in the editor (dark stroke), close it and
      //    remove it from the multi-select. Other teal range-selected
      //    days stay.
      // 2) Otherwise, if there's an active multi-selection, clear it.
      if (selectedDate) {
        const wasSelected = selectedDate;
        closeEditor();
        if (selectedDates.has(wasSelected)) {
          const next = new Set(selectedDates);
          next.delete(wasSelected);
          selectedDates = next;
        }
        return;
      }
      if (selectedDates.size > 0) {
        selectedDates = new Set();
      }
      return;
    }

    if (e.key === "Enter") {
      if (conflictToDelete) {
        e.preventDefault();
        confirmRemoveConflict();
        return;
      }
      if (clearConfirmOpen) {
        e.preventDefault();
        performClearDay();
        return;
      }
    }

    if (e.key === "Backspace" || e.key === "Delete") {
      if (isEditingText()) return;
      if (readOnly || defaultsOpen || clearConfirmOpen || conflictToDelete)
        return;
      if (!selectedDate) return;
      e.preventDefault();
      requestClearDay();
      return;
    }

    // Shift+, (=<) toggles the left cast/team sidebar; Shift+. (=>)
    // toggles the right day-tool sidebar. Only fires when no day is
    // selected (the day editor below reuses these same keys for its
    // expand/collapse-all-calls shortcut) and no modal/popup is open.
    if ((e.key === "<" || e.key === ">") && !selectedDate) {
      if (isEditingText()) return;
      if (
        readOnly ||
        defaultsOpen ||
        clearConfirmOpen ||
        conflictToDelete ||
        castEditorOpen ||
        showEditorOpen ||
        dateEditorOpen ||
        exportOpen ||
        contactSheetOpen ||
        conflictRequestOpen
      ) {
        return;
      }
      e.preventDefault();
      if (e.key === "<") {
        sidebarCollapsed = !sidebarCollapsed;
      } else {
        rightSidebarCollapsedPref = !rightSidebarCollapsedPref;
      }
      return;
    }

    // . = collapse all calls, , = expand all calls.
    // Only when the editor is open and the user isn't typing in a field.
    if (e.key === ">" || e.key === "<") {
      if (isEditingText()) return;
      if (!selectedDate) return;
      if (readOnly || defaultsOpen || clearConfirmOpen || conflictToDelete)
        return;
      e.preventDefault();
      editorAllCollapsed = e.key === ">";
      // Reset after a tick so the same key can trigger the $effect again.
      queueMicrotask(() => {
        editorAllCollapsed = undefined;
      });
    }
  }

  function updateSelectedDay(patch: Partial<ScheduleDay>) {
    pushUndo();
    if (!selectedDate) return;
    const iso = selectedDate;
    const current = doc.schedule[iso];
    if (current) {
      doc.schedule[iso] = { ...current, ...patch };
      // Picking a different event type via the editor pill row transfers
      // ownership from the defaults flow back to the editor: the date
      // should no longer appear in the Defaults mini-cal picker as a
      // defaults-owned assignment, and a subsequent Clear should delete
      // the day instead of preserving its type.
      if (
        patch.eventTypeId !== undefined &&
        patch.eventTypeId !== current.eventTypeId &&
        isInDefaults(iso)
      ) {
        removeFromDefaults(iso);
      }
      return;
    }
    // First real edit on a blank cell: promote the draft into the
    // committed schedule with the incoming patch applied. This path is
    // NOT owned by the defaults flow.
    if (draftDay) {
      doc.schedule[iso] = { ...draftDay, ...patch };
      draftDay = null;
    }
  }

  function addLocationPreset(name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (doc.locationPresets.some((p) => p.toLowerCase() === trimmed.toLowerCase())) return;
    pushUndoImmediate();
    doc.locationPresets = [...doc.locationPresets, trimmed];
  }

  function addConflict(c: Conflict) {
    pushUndoImmediate();
    doc.conflicts = [...doc.conflicts, c];
  }

  function importConflicts(conflicts: Conflict[]) {
    if (conflicts.length === 0) return;
    pushUndoImmediate();
    doc.conflicts = [...doc.conflicts, ...conflicts];
  }

  function moveCastToCrew(id: string) {
    const member = doc.cast.find((m) => m.id === id);
    if (!member) return;
    pushUndoImmediate();
    const newCrew: CrewMember = {
      id: `crew_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      firstName: member.firstName,
      lastName: member.lastName,
      role: member.character ?? "",
      color: member.color,
      middleName: member.middleName,
      suffix: member.suffix,
      pronouns: member.pronouns,
      email: member.email,
      phone: member.phone,
    };
    doc.crew = [...doc.crew, newCrew];
    doc.cast = doc.cast.filter((m) => m.id !== id);
    // Re-point any conflicts referencing the old cast id to the new crew id
    doc.conflicts = doc.conflicts.map((c) => c.actorId === id ? { ...c, actorId: newCrew.id } : c);
    // If they were individually called in any call, re-point to the new crew id
    const newSchedule: typeof doc.schedule = {};
    for (const [iso, day] of Object.entries(doc.schedule)) {
      newSchedule[iso] = {
        ...day,
        calls: day.calls.map((call) => {
          if (!call.calledActorIds.includes(id)) return call;
          const crewIds = call.calledCrewIds ? [...call.calledCrewIds, newCrew.id] : [newCrew.id];
          return {
            ...call,
            calledActorIds: call.calledActorIds.filter((aid) => aid !== id),
            calledCrewIds: crewIds,
          };
        }),
      };
    }
    doc.schedule = newSchedule;
  }

  function moveCrewToCast(id: string) {
    const member = doc.crew.find((m) => m.id === id);
    if (!member) return;
    pushUndoImmediate();
    const newCast: CastMember = {
      id: `actor_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      firstName: member.firstName,
      lastName: member.lastName,
      character: member.role ?? "",
      color: member.color,
      middleName: member.middleName,
      suffix: member.suffix,
      pronouns: member.pronouns,
      email: member.email,
      phone: member.phone,
    };
    doc.cast = [...doc.cast, newCast];
    doc.crew = doc.crew.filter((m) => m.id !== id);
    doc.conflicts = doc.conflicts.map((c) => c.actorId === id ? { ...c, actorId: newCast.id } : c);
    const newSchedule: typeof doc.schedule = {};
    for (const [iso, day] of Object.entries(doc.schedule)) {
      newSchedule[iso] = {
        ...day,
        calls: day.calls.map((call) => {
          if (!call.calledCrewIds || !call.calledCrewIds.includes(id)) return call;
          return {
            ...call,
            calledCrewIds: call.calledCrewIds.filter((cid) => cid !== id),
            calledActorIds: [...call.calledActorIds, newCast.id],
          };
        }),
      };
    }
    doc.schedule = newSchedule;
  }

  /**
   * Two-step delete for conflicts: the editor calls this, we stash the
   * target conflict in state, and a confirmation modal asks the user to
   * confirm before the actual filter happens. Prevents accidental
   * destruction of a scheduling note that may have been typed carefully.
   */
  function requestRemoveConflict(id: string) {
    const found = doc.conflicts.find((c) => c.id === id) ?? null;
    if (!found) return;
    conflictToDelete = found;
  }

  function confirmRemoveConflict() {
    if (!conflictToDelete) return;
    pushUndoImmediate();
    const id = conflictToDelete.id;
    doc.conflicts = doc.conflicts.filter((c) => c.id !== id);
    conflictToDelete = null;
  }

  function cancelRemoveConflict() {
    conflictToDelete = null;
  }

  function updateSettings(patch: Partial<Settings>) {
    pushUndo();
    doc.settings = { ...doc.settings, ...patch };
  }

  function updateShow(patch: Partial<Show>) {
    pushUndo();
    doc.show = { ...doc.show, ...patch };
  }

  function removeLocationPreset(name: string) {
    pushUndoImmediate();
    doc.locationPresets = doc.locationPresets.filter((p) => p !== name);
    // If the removed location was the show default, clear it.
    if (doc.settings.defaultLocation === name) {
      doc.settings = { ...doc.settings, defaultLocation: "" };
    }
  }

  function updateLocationPreset(name: string, patch: { color?: string; shape?: string }) {
    pushUndoImmediate();
    const presets = doc.locationPresetsV2 ? [...doc.locationPresetsV2] : [];
    const idx = presets.findIndex((p) => p.name.toLowerCase() === name.toLowerCase());
    if (idx >= 0) {
      presets[idx] = { ...presets[idx], ...patch };
    } else {
      presets.push({ name, ...patch });
    }
    doc.locationPresetsV2 = presets;
  }

  function addEventType(type: EventType) {
    pushUndoImmediate();
    doc.eventTypes = [...doc.eventTypes, type];
  }

  function reorderEventType(id: string, dir: "up" | "down") {
    const idx = doc.eventTypes.findIndex((t) => t.id === id);
    if (idx < 0) return;
    const swap = dir === "up" ? idx - 1 : idx + 1;
    if (swap < 0 || swap >= doc.eventTypes.length) return;
    pushUndoImmediate();
    const next = [...doc.eventTypes];
    [next[idx]!, next[swap]!] = [next[swap]!, next[idx]!];
    doc.eventTypes = next;
  }

  function reorderLocationPreset(name: string, dir: "up" | "down") {
    const idx = doc.locationPresets.indexOf(name);
    if (idx < 0) return;
    const swap = dir === "up" ? idx - 1 : idx + 1;
    if (swap < 0 || swap >= doc.locationPresets.length) return;
    pushUndoImmediate();
    const next = [...doc.locationPresets];
    [next[idx]!, next[swap]!] = [next[swap]!, next[idx]!];
    doc.locationPresets = next;
  }

  /** Small palette the sidebar + button cycles through when the user
   *  creates a new event type without going into Default Settings. The
   *  user can always tweak colors later in the modal. */
  const EVENT_TYPE_PALETTE: Array<{ bg: string; text: string }> = [
    { bg: "#e3f2fd", text: "#1565c0" }, // blue
    { bg: "#fff3e0", text: "#e65100" }, // orange
    { bg: "#f3e5f5", text: "#6a1b9a" }, // purple
    { bg: "#ffebee", text: "#c62828" }, // red
    { bg: "#eceff1", text: "#546e7a" }, // slate
    { bg: "#e8f5e9", text: "#2e7d32" }, // green
    { bg: "#fff8e1", text: "#f57f17" }, // amber
  ];

  /** Create an event type from just a name: generates an id, picks a
   *  color from the palette based on how many types already exist, and
   *  defaults isDressPerf off. Used by the right sidebar's + button. */
  function addEventTypeByName(name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    // Reject case-insensitive duplicates.
    if (doc.eventTypes.some((t) => t.name.toLowerCase() === trimmed.toLowerCase())) {
      return;
    }
    const palette = EVENT_TYPE_PALETTE[doc.eventTypes.length % EVENT_TYPE_PALETTE.length];
    const newType: EventType = {
      id: `et_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      name: trimmed,
      bgColor: palette.bg,
      textColor: palette.text,
      isDressPerf: false,
    };
    addEventType(newType);
  }

  function updateEventType(id: string, patch: Partial<EventType>) {
    pushUndo();
    doc.eventTypes = doc.eventTypes.map((t) =>
      t.id === id ? { ...t, ...patch } : t,
    );
  }

  function removeEventType(id: string) {
    if (doc.eventTypes.length <= 1) return;
    pushUndoImmediate();
    const remaining = doc.eventTypes.filter((t) => t.id !== id);
    doc.eventTypes = remaining;
    // Clear default event type if we just removed it
    if (doc.settings.defaultEventType === id) {
      doc.settings = { ...doc.settings, defaultEventType: "" };
    }
    // Reassign any days that pointed at the removed type so the grid
    // doesn't render empty badges. Fall back to the first remaining type.
    const fallbackId = remaining[0]?.id;
    if (!fallbackId) return;
    for (const [date, day] of Object.entries(doc.schedule)) {
      if (day.eventTypeId === id) {
        doc.schedule[date] = { ...day, eventTypeId: fallbackId };
      }
    }
  }

  /** Whether an ISO date is currently owned by the defaults mini-cal flow. */
  function isInDefaults(iso: IsoDate): boolean {
    return doc.settings.defaultsAssignedDates?.includes(iso) ?? false;
  }

  function addToDefaults(iso: IsoDate) {
    if (isInDefaults(iso)) return;
    doc.settings = {
      ...doc.settings,
      defaultsAssignedDates: [...(doc.settings.defaultsAssignedDates ?? []), iso],
    };
  }

  /**
   * Remove an actor from a specific call on a specific day, from the
   * grid cell × button. Handles both:
   * - Directly-called actors (in `calledActorIds`): simply filtered out.
   * - Group-called actors (called via `calledGroupIds` expansion): we
   *   expand all the call's groups into their individual member ids,
   *   merge with any pre-existing direct ids, filter out the target,
   *   and clear the group list. The effective roster is preserved
   *   minus the removed actor; the "called as a group" metadata is
   *   lost for this day only. A director who wants the group back can
   *   re-add it from the editor.
   */
  function removeActorFromCall(
    iso: IsoDate,
    callId: string,
    actorId: string,
  ) {
    const day = doc.schedule[iso];
    if (!day) return;
    pushUndoImmediate();
    doc.schedule[iso] = {
      ...day,
      calls: day.calls.map((c) => {
        if (c.id !== callId) return c;
        if (c.calledGroupIds.length === 0) {
          // Fast path: no groups, just filter the direct list.
          return {
            ...c,
            calledActorIds: c.calledActorIds.filter((id) => id !== actorId),
          };
        }
        // Groups in play: expand everyone into individuals, drop the
        // target, and clear the group references so the roster exactly
        // matches the user's intent.
        const expanded = new Set<string>(c.calledActorIds);
        for (const gid of c.calledGroupIds) {
          const g = doc.groups.find((x) => x.id === gid);
          if (g) for (const mid of g.memberIds) expanded.add(mid);
        }
        expanded.delete(actorId);
        return {
          ...c,
          calledActorIds: Array.from(expanded),
          calledGroupIds: [],
        };
      }),
    };
  }

  function removeCrewFromCall(iso: IsoDate, callId: string, crewId: string) {
    const day = doc.schedule[iso];
    if (!day) return;
    pushUndoImmediate();
    doc.schedule[iso] = {
      ...day,
      calls: day.calls.map((c) => {
        if (c.id !== callId) return c;
        return { ...c, calledCrewIds: (c.calledCrewIds ?? []).filter((id) => id !== crewId) };
      }),
    };
  }

  function removeFromDefaults(iso: IsoDate) {
    if (!isInDefaults(iso)) return;
    doc.settings = {
      ...doc.settings,
      defaultsAssignedDates: (doc.settings.defaultsAssignedDates ?? []).filter(
        (d) => d !== iso,
      ),
    };
  }

  // --- Group CRUD (called from the Sidebar's inline form) ------------

  function addGroup(group: Group) {
    pushUndoImmediate();
    doc.groups = [...doc.groups, group];
  }

  function updateGroup(id: string, patch: Partial<Group>) {
    pushUndoImmediate();
    doc.groups = doc.groups.map((g) => (g.id === id ? { ...g, ...patch } : g));
  }

  /**
   * Delete a group and scrub every call's `calledGroupIds` so no stale
   * references remain. Members who were ONLY called via this group are
   * also removed from those calls (their call-by-group membership was
   * implicit; deleting the group deletes that implicit membership).
   */
  function removeGroup(id: string) {
    pushUndoImmediate();
    doc.groups = doc.groups.filter((g) => g.id !== id);
    for (const [date, day] of Object.entries(doc.schedule)) {
      let touched = false;
      const nextCalls = day.calls.map((c) => {
        if (!c.calledGroupIds.includes(id)) return c;
        touched = true;
        return {
          ...c,
          calledGroupIds: c.calledGroupIds.filter((gid) => gid !== id),
        };
      });
      if (touched) doc.schedule[date] = { ...day, calls: nextCalls };
    }
  }

  /**
   * Convert all calls between group chips and individual actor chips.
   * "collapse": actors that form a complete group get replaced by the group chip.
   * "expand": group chips get replaced by their member actors.
   */
  function convertGroups(mode: "collapse" | "expand") {
    pushUndoImmediate();
    for (const [iso, day] of Object.entries(doc.schedule)) {
      let changed = false;
      const nextCalls = day.calls.map((call) => {
        if (mode === "expand") {
          if (call.calledGroupIds.length === 0 && !call.allCalled) return call;
          const newActorIds = new Set(call.calledActorIds);
          if (call.allCalled) {
            for (const m of doc.cast) newActorIds.add(m.id);
          }
          for (const gid of call.calledGroupIds) {
            const group = doc.groups.find((g) => g.id === gid);
            if (group) {
              for (const mid of group.memberIds) newActorIds.add(mid);
            }
          }
          changed = true;
          return { ...call, calledGroupIds: [] as string[], calledActorIds: [...newActorIds], allCalled: false };
        } else {
          if (call.calledActorIds.length === 0) return call;
          const remainingActors = new Set(call.calledActorIds);
          const newGroupIds = [...call.calledGroupIds];

          // Check if every cast member is called - if so, use allCalled
          const allCastPresent = doc.cast.length > 0 &&
            doc.cast.every((m) => remainingActors.has(m.id));
          if (allCastPresent) {
            changed = true;
            return { ...call, calledGroupIds: [] as string[], calledActorIds: [] as string[], allCalled: true };
          }

          for (const group of doc.groups) {
            if (newGroupIds.includes(group.id)) continue;
            const allPresent = group.memberIds.length > 0 &&
              group.memberIds.every((mid) => remainingActors.has(mid));
            if (allPresent) {
              newGroupIds.push(group.id);
              for (const mid of group.memberIds) remainingActors.delete(mid);
              changed = true;
            }
          }
          if (!changed) return call;
          return { ...call, calledGroupIds: newGroupIds, calledActorIds: [...remainingActors] };
        }
      });
      if (changed) {
        doc.schedule[iso as IsoDate] = { ...day, calls: nextCalls };
      }
    }
    showToast(mode === "expand" ? "Groups expanded into actors" : "Actors collapsed into groups");
  }

  // --- Cast CRUD (from the CastEditorModal) --------------------------

  function addCastMember(member: CastMember) {
    pushUndoImmediate();
    doc.cast = [...doc.cast, member];
  }

  function updateCastMember(id: string, patch: Partial<CastMember>) {
    pushUndo();
    doc.cast = doc.cast.map((m) => (m.id === id ? { ...m, ...patch } : m));
  }

  function removeCastMember(id: string) {
    pushUndoImmediate();
    doc.cast = doc.cast.filter((m) => m.id !== id);
    // Scrub the actor from every call's calledActorIds
    for (const [date, day] of Object.entries(doc.schedule)) {
      let touched = false;
      const nextCalls = day.calls.map((c) => {
        if (!c.calledActorIds.includes(id)) return c;
        touched = true;
        return {
          ...c,
          calledActorIds: c.calledActorIds.filter((a) => a !== id),
        };
      });
      if (touched) doc.schedule[date] = { ...day, calls: nextCalls };
    }
    // Scrub from groups
    doc.groups = doc.groups.map((g) =>
      g.memberIds.includes(id)
        ? { ...g, memberIds: g.memberIds.filter((m) => m !== id) }
        : g,
    );
    // Scrub conflicts
    doc.conflicts = doc.conflicts.filter((c) => c.actorId !== id);
  }

  function importCast(added: CastMember[], updates: { id: string; patch: Partial<CastMember> }[]) {
    pushUndoImmediate();
    if (added.length > 0) {
      doc.cast = [...doc.cast, ...added];
    }
    if (updates.length > 0) {
      doc.cast = doc.cast.map((m) => {
        const upd = updates.find((u) => u.id === m.id);
        return upd ? { ...m, ...upd.patch } : m;
      });
    }
  }

  function reorderCastMember(id: string, direction: "up" | "down") {
    pushUndoImmediate();
    const idx = doc.cast.findIndex((m) => m.id === id);
    if (idx < 0) return;
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= doc.cast.length) return;
    const next = [...doc.cast];
    const tmp = next[idx]!;
    next[idx] = next[swapIdx]!;
    next[swapIdx] = tmp;
    doc.cast = next;
  }

  // --- Crew (production team) management ---
  function addCrewMember(member: CrewMember) {
    pushUndoImmediate();
    doc.crew = [...doc.crew, member];
  }

  function updateCrewMember(id: string, patch: Partial<CrewMember>) {
    pushUndo();
    doc.crew = doc.crew.map((m) => (m.id === id ? { ...m, ...patch } : m));
  }

  function removeCrewMember(id: string) {
    pushUndoImmediate();
    doc.crew = doc.crew.filter((m) => m.id !== id);
  }

  function importCrew(added: CrewMember[], updates: { id: string; patch: Partial<CrewMember> }[]) {
    pushUndoImmediate();
    if (added.length > 0) {
      doc.crew = [...doc.crew, ...added];
    }
    if (updates.length > 0) {
      doc.crew = doc.crew.map((m) => {
        const upd = updates.find((u) => u.id === m.id);
        return upd ? { ...m, ...upd.patch } : m;
      });
    }
  }

  function reorderCrewMember(id: string, direction: "up" | "down") {
    pushUndoImmediate();
    const idx = doc.crew.findIndex((m) => m.id === id);
    if (idx < 0) return;
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= doc.crew.length) return;
    const next = [...doc.crew];
    const tmp = next[idx]!;
    next[idx] = next[swapIdx]!;
    next[swapIdx] = tmp;
    doc.crew = next;
  }

  // --- Cast display mode ---------------------------------------------

  function setCastDisplayMode(mode: CastDisplayMode) {
    doc.settings = { ...doc.settings, castDisplayMode: mode };
  }

  // --- Drop handlers (from sidebar chips onto day cells) -------------

  /**
   * Shared seeder for drop targets: if the date has no committed
   * ScheduleDay yet (blank cell), we create one via `emptyDay(iso)` so
   * the roster has somewhere to land. Returns the call the droppee
   * should attach to (the first call, creating one if the day was
   * skeleton-only).
   */
  function ensureCallForDrop(iso: IsoDate): { call: Call; day: ScheduleDay } | null {
    let existing = doc.schedule[iso];
    if (!existing) {
      // Use dropShell (not emptyDay) so actor drops on a blank day don't
      // auto-stamp "Rehearsal" as the event type or inherit weekday call
      // times. The user wants the same minimalism as the right tool
      // sidebar: dropping an actor should just show the actor chip with
      // no surrounding clutter.
      existing = dropShell(iso);
      doc.schedule[iso] = existing;
    }
    if (existing.calls.length === 0) {
      // Seed an untimed placeholder call so the dropped actor has a
      // home. No eventTypeId, no times, no description - just a shell
      // that renders the chip. When the user later drops a Call chip,
      // dropCallOnDate promotes this placeholder in place (filling in
      // times from weekday defaults) so the actors don't have to be
      // re-added.
      const newCall: Call = {
        id: `call_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        label: "",
        time: "",
        endTime: "",
        calledActorIds: [],
        calledGroupIds: [],
      };
      const nextDay = { ...existing, calls: [newCall] };
      doc.schedule[iso] = nextDay;
      return { call: newCall, day: nextDay };
    }
    return { call: existing.calls[0]!, day: existing };
  }

  /**
   * Find the target call for a drop. When `callId` is provided (the user
   * aimed at a specific call block in a multi-call day), use that call.
   * Otherwise fall back to the first call, creating one if needed.
   */
  function resolveDropTarget(
    iso: IsoDate,
    callId?: string,
  ): { day: ScheduleDay; callIndex: number } | null {
    const seeded = ensureCallForDrop(iso);
    if (!seeded) return null;
    const { day } = seeded;
    if (callId) {
      const idx = day.calls.findIndex((c) => c.id === callId);
      if (idx >= 0) return { day, callIndex: idx };
    }
    return { day, callIndex: 0 };
  }

  function patchCallAtIndex(
    iso: IsoDate,
    day: ScheduleDay,
    idx: number,
    patch: Partial<Call>,
  ) {
    doc.schedule[iso] = {
      ...day,
      calls: day.calls.map((c, i) => (i === idx ? { ...c, ...patch } : c)),
    };
  }

  /** Dates to apply a cell-level cast/group/all-called drop to. When
   *  the user targets a specific call block (`callId` provided) we
   *  only touch that call on the cursor day - fan-out doesn't make
   *  sense across days with different call ids. Without a callId,
   *  honor the multi-selection just like the right sidebar chips. */
  function cellLevelTargets(iso: IsoDate, callId: string | undefined): IsoDate[] {
    if (callId) return [iso];
    if (selectedDates.has(iso) && selectedDates.size > 1) {
      return Array.from(selectedDates);
    }
    return [iso];
  }

  function dropActorOnDate(iso: IsoDate, actorId: string, callId?: string) {
    pushUndoImmediate();
    const targets = cellLevelTargets(iso, callId);
    for (const date of targets) {
      const resolved = resolveDropTarget(date, callId);
      if (!resolved) continue;
      const { day, callIndex } = resolved;
      const target = day.calls[callIndex]!;
      if (target.calledActorIds.includes(actorId)) continue;
      // Skip this day if the actor has a blocking conflict here.
      const dateConflicts = doc.conflicts.filter((c) => c.date === date);
      if (blockingConflictsFor(actorId, target, dateConflicts).length > 0) {
        continue;
      }
      patchCallAtIndex(date, day, callIndex, {
        calledActorIds: [...target.calledActorIds, actorId],
      });
    }
  }

  function dropCrewOnDate(iso: IsoDate, crewId: string, callId?: string) {
    pushUndoImmediate();
    const targets = cellLevelTargets(iso, callId);
    for (const date of targets) {
      const resolved = resolveDropTarget(date, callId);
      if (!resolved) continue;
      const { day, callIndex } = resolved;
      const target = day.calls[callIndex]!;
      const existing = target.calledCrewIds ?? [];
      if (existing.includes(crewId)) continue;
      patchCallAtIndex(date, day, callIndex, {
        calledCrewIds: [...existing, crewId],
      });
    }
  }

  function dropGroupOnDate(iso: IsoDate, groupId: string, callId?: string) {
    pushUndoImmediate();
    const targets = cellLevelTargets(iso, callId);
    for (const date of targets) {
      const resolved = resolveDropTarget(date, callId);
      if (!resolved) continue;
      const { day, callIndex } = resolved;
      const target = day.calls[callIndex]!;

      if (doc.settings.groupDropMode === "expand") {
        // Expand: add each group member as an individual actor, skipping
        // members with a blocking conflict on this date.
        const group = doc.groups.find((g) => g.id === groupId);
        if (!group) continue;
        const dateConflicts = doc.conflicts.filter((c) => c.date === date);
        const existingIds = new Set(target.calledActorIds);
        const newIds = group.memberIds.filter(
          (id) =>
            !existingIds.has(id) &&
            blockingConflictsFor(id, target, dateConflicts).length === 0,
        );
        if (newIds.length === 0) continue;
        patchCallAtIndex(date, day, callIndex, {
          calledActorIds: [...target.calledActorIds, ...newIds],
        });
      } else {
        // Group mode (default): add as a group chip.
        if (target.calledGroupIds.includes(groupId)) continue;
        patchCallAtIndex(date, day, callIndex, {
          calledGroupIds: [...target.calledGroupIds, groupId],
        });
      }
    }
  }

  function dropAllCalledOnDate(iso: IsoDate, callId?: string) {
    pushUndoImmediate();
    const targets = cellLevelTargets(iso, callId);
    for (const date of targets) {
      const resolved = resolveDropTarget(date, callId);
      if (!resolved) continue;
      const { day, callIndex } = resolved;
      const target = day.calls[callIndex]!;
      if (target.allCalled) continue;
      patchCallAtIndex(date, day, callIndex, { allCalled: true });
    }
  }

  // --- Day-tool sidebar drops ---------------------------------------
  // The right tool sidebar drops chips that mutate day-level fields
  // (eventTypeId, location) or add a brand-new call/description/note.
  // When the cursor target is part of a multi-select, the drop fans
  // out across every selected day. Otherwise it's just the target.

  /** If `iso` is part of the active multi-select, return all selected
   *  dates; otherwise return just `[iso]`. */
  function expandToSelected(iso: IsoDate): IsoDate[] {
    if (selectedDates.has(iso) && selectedDates.size > 1) {
      return Array.from(selectedDates);
    }
    return [iso];
  }

  function dropEventTypeOnDate(iso: IsoDate, typeId: string) {
    pushUndoImmediate();
    // Smart-add to the day's event types, mirroring the location drop:
    // - First type ever: set as the primary `eventTypeId`.
    // - Same type already primary: no-op.
    // - Type already in secondaries: no-op.
    // - Different type: append to `secondaryTypeIds` (renders as an
    //   extra badge alongside the primary).
    const targets = expandToSelected(iso);
    for (const date of targets) {
      const existing = doc.schedule[date] ?? dropShell(date);
      const currentPrimary = existing.eventTypeId;
      if (!currentPrimary) {
        doc.schedule[date] = { ...existing, eventTypeId: typeId };
        continue;
      }
      if (currentPrimary === typeId) continue;
      const secondaries = existing.secondaryTypeIds ?? [];
      if (secondaries.includes(typeId)) continue;
      doc.schedule[date] = {
        ...existing,
        secondaryTypeIds: [...secondaries, typeId],
      };
    }
  }

  function dropLocationOnDate(iso: IsoDate, locName: string, callId?: string) {
    pushUndoImmediate();
    // Per-call drop: target a specific call on the cursor day only.
    // Multi-day expansion doesn't apply because call ids don't match
    // across days.
    if (callId) {
      const day = doc.schedule[iso];
      if (!day) return;
      const idx = day.calls.findIndex((c) => c.id === callId);
      if (idx < 0) return;
      patchCallAtIndex(iso, day, idx, { location: locName });
      return;
    }
    // Cell-level drop: smart-add to the day's locations.
    // - First location ever: set day.location (becomes the fallback for
    //   every call without an explicit override, coloring them all).
    // - Same location dropped again: no-op.
    // - Different location: append to extraLocations so it appears in
    //   the footer without recoloring any existing call.
    const targets = expandToSelected(iso);
    for (const date of targets) {
      const existing = doc.schedule[date] ?? dropShell(date);
      const currentDayLoc = (existing.location ?? "").trim();
      if (!currentDayLoc) {
        doc.schedule[date] = { ...existing, location: locName };
        continue;
      }
      if (currentDayLoc === locName) continue;
      const extras = existing.extraLocations ?? [];
      if (extras.includes(locName)) continue;
      doc.schedule[date] = { ...existing, extraLocations: [...extras, locName] };
    }
  }

  function dropCallOnDate(iso: IsoDate) {
    pushUndoImmediate();
    const targets = expandToSelected(iso);
    let cursorCallId = "";
    for (const date of targets) {
      const existing = doc.schedule[date] ?? dropShell(date);
      const weekday = getDefaultCallTimes(doc.settings, date);
      // If the day has an untimed placeholder call (created by an
      // earlier actor/group drop on a blank day), promote it in place
      // so the already-dropped chips automatically belong to this new
      // timed call instead of being stranded.
      const placeholderIdx = existing.calls.findIndex(
        (c) => !c.time && !c.endTime,
      );
      if (placeholderIdx >= 0) {
        const placeholder = existing.calls[placeholderIdx]!;
        if (date === iso) cursorCallId = placeholder.id;
        doc.schedule[date] = {
          ...existing,
          calls: existing.calls.map((c, i) =>
            i === placeholderIdx
              ? {
                  ...c,
                  time: weekday?.startTime ?? "",
                  endTime: weekday?.endTime ?? "",
                  manuallyAdded: true,
                }
              : c,
          ),
        };
        continue;
      }
      const id = `call_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      if (date === iso) cursorCallId = id;
      const newCall: Call = {
        id,
        label: "",
        time: weekday?.startTime ?? "",
        endTime: weekday?.endTime ?? "",
        calledActorIds: [],
        calledGroupIds: [],
        manuallyAdded: true,
      };
      doc.schedule[date] = { ...existing, calls: [...existing.calls, newCall] };
    }
    // Immediately open the call's "what are we doing" description editor
    // on the cursor-target day only, so the user can type without an
    // extra click.
    if (cursorCallId) {
      startInlineEdit(iso, "description", cursorCallId);
    }
  }

  // --- Move chips between calls within the same day ----------------
  // The user can drag an in-cell actor/crew/group/all-called chip
  // from one call block to another; the chip gets removed from the
  // source call and added to the target call in one undo step.

  function moveActorBetweenCalls(
    date: IsoDate,
    sourceCallId: string,
    targetCallId: string,
    actorId: string,
  ) {
    const day = doc.schedule[date];
    if (!day || sourceCallId === targetCallId) return;
    pushUndoImmediate();
    doc.schedule[date] = {
      ...day,
      calls: day.calls.map((c) => {
        if (c.id === sourceCallId) {
          return {
            ...c,
            calledActorIds: c.calledActorIds.filter((id) => id !== actorId),
          };
        }
        if (c.id === targetCallId) {
          return c.calledActorIds.includes(actorId)
            ? c
            : { ...c, calledActorIds: [...c.calledActorIds, actorId] };
        }
        return c;
      }),
    };
  }

  function moveCrewBetweenCalls(
    date: IsoDate,
    sourceCallId: string,
    targetCallId: string,
    crewId: string,
  ) {
    const day = doc.schedule[date];
    if (!day || sourceCallId === targetCallId) return;
    pushUndoImmediate();
    doc.schedule[date] = {
      ...day,
      calls: day.calls.map((c) => {
        if (c.id === sourceCallId) {
          return {
            ...c,
            calledCrewIds: (c.calledCrewIds ?? []).filter((id) => id !== crewId),
          };
        }
        if (c.id === targetCallId) {
          const existing = c.calledCrewIds ?? [];
          return existing.includes(crewId)
            ? c
            : { ...c, calledCrewIds: [...existing, crewId] };
        }
        return c;
      }),
    };
  }

  function moveGroupBetweenCalls(
    date: IsoDate,
    sourceCallId: string,
    targetCallId: string,
    groupId: string,
  ) {
    const day = doc.schedule[date];
    if (!day || sourceCallId === targetCallId) return;
    pushUndoImmediate();
    doc.schedule[date] = {
      ...day,
      calls: day.calls.map((c) => {
        if (c.id === sourceCallId) {
          return {
            ...c,
            calledGroupIds: c.calledGroupIds.filter((id) => id !== groupId),
          };
        }
        if (c.id === targetCallId) {
          return c.calledGroupIds.includes(groupId)
            ? c
            : { ...c, calledGroupIds: [...c.calledGroupIds, groupId] };
        }
        return c;
      }),
    };
  }

  function moveAllCalledBetweenCalls(
    date: IsoDate,
    sourceCallId: string,
    targetCallId: string,
  ) {
    const day = doc.schedule[date];
    if (!day || sourceCallId === targetCallId) return;
    pushUndoImmediate();
    doc.schedule[date] = {
      ...day,
      calls: day.calls.map((c) => {
        if (c.id === sourceCallId) return { ...c, allCalled: false };
        if (c.id === targetCallId) return { ...c, allCalled: true };
        return c;
      }),
    };
  }

  // --- Hover-✕ remove handlers (day-level items) -------------------

  /** Remove an event type from a day. If it's the primary, the first
   *  secondary (if any) takes over as primary. Otherwise just splice
   *  it out of `secondaryTypeIds`. */
  function removeEventTypeFromDay(date: IsoDate, typeId: string) {
    const day = doc.schedule[date];
    if (!day) return;
    pushUndoImmediate();
    if (day.eventTypeId === typeId) {
      const secondaries = day.secondaryTypeIds ?? [];
      if (secondaries.length > 0) {
        const [next, ...rest] = secondaries;
        doc.schedule[date] = {
          ...day,
          eventTypeId: next,
          secondaryTypeIds: rest.length > 0 ? rest : undefined,
        };
      } else {
        doc.schedule[date] = { ...day, eventTypeId: "" };
      }
      return;
    }
    const secondaries = day.secondaryTypeIds ?? [];
    const next = secondaries.filter((id) => id !== typeId);
    doc.schedule[date] = {
      ...day,
      secondaryTypeIds: next.length > 0 ? next : undefined,
    };
  }

  function removeCallFromDay(date: IsoDate, callId: string) {
    const day = doc.schedule[date];
    if (!day) return;
    pushUndoImmediate();
    doc.schedule[date] = {
      ...day,
      calls: day.calls.filter((c) => c.id !== callId),
    };
  }

  function removeNotesFromDay(date: IsoDate) {
    const day = doc.schedule[date];
    if (!day) return;
    pushUndoImmediate();
    doc.schedule[date] = { ...day, notes: "" };
  }

  /** Remove a location from a day everywhere it appears: clears
   *  `day.location` if matched, removes from `extraLocations`, and
   *  clears any `call.location` matches. */
  function removeLocationFromDay(date: IsoDate, locName: string) {
    const day = doc.schedule[date];
    if (!day) return;
    pushUndoImmediate();
    const extras = (day.extraLocations ?? []).filter((l) => l !== locName);
    doc.schedule[date] = {
      ...day,
      location: day.location === locName ? "" : day.location,
      extraLocations: extras.length > 0 ? extras : undefined,
      calls: day.calls.map((c) =>
        c.location === locName ? { ...c, location: "" } : c,
      ),
    };
  }

  function dropNoteOnDate(iso: IsoDate) {
    pushUndoImmediate();
    const targets = expandToSelected(iso);
    for (const date of targets) {
      const existing = doc.schedule[date] ?? dropShell(date);
      doc.schedule[date] = { ...existing, notes: existing.notes ?? "" };
    }
    startInlineEdit(iso, "notes");
  }

  // --- Remove handlers (from × on grid chips) ------------------------

  function removeGroupFromCall(iso: IsoDate, callId: string, groupId: string) {
    const day = doc.schedule[iso];
    if (!day) return;
    pushUndoImmediate();
    doc.schedule[iso] = {
      ...day,
      calls: day.calls.map((c) =>
        c.id === callId
          ? { ...c, calledGroupIds: c.calledGroupIds.filter((g) => g !== groupId) }
          : c,
      ),
    };
  }

  function removeAllCalledFromCall(iso: IsoDate, callId: string) {
    const day = doc.schedule[iso];
    if (!day) return;
    pushUndoImmediate();
    doc.schedule[iso] = {
      ...day,
      calls: day.calls.map((c) =>
        c.id === callId ? { ...c, allCalled: false } : c,
      ),
    };
  }

  // --- Clipboard operations -----------------------------------------

  function showToast(msg: string) {
    toastMessage = msg;
  }

  function formatDateShort(iso: IsoDate): string {
    const [y, m, d] = iso.split("-").map(Number);
    const dt = new Date(Date.UTC(y!, m! - 1, d!));
    return dt.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
  }

  /** Clone a reactive object by JSON round-trip. structuredClone can't
   *  handle Svelte 5's proxy objects, so we use this instead. */
  function cloneDay(day: ScheduleDay): ScheduleDay {
    return JSON.parse(JSON.stringify(day)) as ScheduleDay;
  }

  function copyDay() {
    if (!selectedDate) return;
    const day = doc.schedule[selectedDate];
    if (!day) {
      showToast("Nothing to copy");
      return;
    }
    clipboard = {
      day: cloneDay(day),
      sourceDate: selectedDate,
      isCut: false,
    };
    showToast(`Copied ${formatDateShort(selectedDate)}`);
  }

  function cutDay() {
    if (!selectedDate) return;
    const day = doc.schedule[selectedDate];
    if (!day) {
      showToast("Nothing to cut");
      return;
    }
    clipboard = {
      day: cloneDay(day),
      sourceDate: selectedDate,
      isCut: true,
    };
    showToast(`Cut ${formatDateShort(selectedDate)} - select a day and paste`);
  }

  function pasteDay() {
    if (!clipboard) {
      showToast("Nothing on clipboard");
      return;
    }

    // Resolve candidate target dates: prefer the multi-selection if
    // it's populated (even if only one entry), otherwise fall back
    // to the single selectedDate. Then strip the source date in copy
    // mode so you can't paste onto yourself.
    let candidates: IsoDate[] = [];
    if (selectedDates.size > 0) {
      candidates = Array.from(selectedDates);
    } else if (selectedDate) {
      candidates = [selectedDate];
    } else {
      showToast("Select a day first");
      return;
    }
    const targetDates = candidates.filter(
      (iso) => !(iso === clipboard!.sourceDate && !clipboard!.isCut),
    );
    if (targetDates.length === 0) {
      showToast("Can't paste onto the same day");
      return;
    }

    // If ANY of the target days already has content, open the
    // Replace/Merge modal. The user's choice then applies to every
    // target day uniformly. Without this check the multi-day paste
    // would silently overwrite existing content.
    const anyHasContent = targetDates.some((iso) => {
      const d = doc.schedule[iso];
      return !!d && d.calls.length > 0;
    });
    if (anyHasContent) {
      pasteConflict = {
        targetDates,
        day: clipboard.day,
        isCut: clipboard.isCut,
        sourceDate: clipboard.sourceDate,
      };
      return;
    }

    // Clean targets (all blank): just replace them all.
    executePasteOnTargets("replace", targetDates);
  }

  function executePaste(mode: "replace" | "merge") {
    if (!pasteConflict) return;
    executePasteOnTargets(mode, pasteConflict.targetDates);
  }

  function executePasteOnTargets(
    mode: "replace" | "merge",
    targetDates: IsoDate[],
  ) {
    if (!clipboard || targetDates.length === 0) return;
    pushUndoImmediate();
    const source = clipboard.day;

    for (const targetDate of targetDates) {
      if (mode === "replace") {
        doc.schedule[targetDate] = cloneDay(source);
      } else {
        // Merge: keep the target's event type and add the source's calls
        const existing = doc.schedule[targetDate];
        if (existing) {
          doc.schedule[targetDate] = {
            ...existing,
            calls: [
              ...existing.calls,
              ...(JSON.parse(JSON.stringify(source.calls)) as Call[]).map((c) => ({
                ...c,
                id: `call_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
              })),
            ],
            notes: existing.notes
              ? existing.notes + source.notes
              : source.notes,
          };
        } else {
          doc.schedule[targetDate] = cloneDay(source);
        }
      }
    }

    // If cut, clear the source (skip if the source was itself one of
    // the target dates - it's already been overwritten).
    if (clipboard.isCut) {
      const src = clipboard.sourceDate;
      if (doc.schedule[src] && !targetDates.includes(src)) {
        if (isInDefaults(src)) {
          doc.schedule[src] = {
            eventTypeId: doc.schedule[src]!.eventTypeId,
            calls: [],
            description: "",
            notes: "",
            location: "",
          };
        } else {
          const next = { ...doc.schedule };
          delete next[src];
          doc.schedule = next;
        }
      }
    }

    const wasCut = clipboard.isCut;
    const label =
      targetDates.length === 1
        ? formatDateShort(targetDates[0]!)
        : `${targetDates.length} days`;
    showToast(wasCut ? `Moved to ${label}` : `Pasted onto ${label}`);
    // Keep clipboard for copy (paste multiple times), clear for cut
    if (wasCut) clipboard = null;
    pasteConflict = null;
    if (targetDates.length > 1) selectedDates = new Set();
  }

  function cancelPaste() {
    pasteConflict = null;
  }

  /** Copy/Move buttons from the editor header. */
  function copyDayFromEditor() {
    copyDay();
  }

  function moveDayFromEditor() {
    cutDay();
    closeEditor();
  }

  /**
   * Bulk-assign an event type to a date from the Defaults mini-calendar.
   * Two concerns travel in lockstep:
   * - `doc.schedule[iso].eventTypeId` drives the badge on the grid cell.
   * - `doc.settings.defaultsAssignedDates` marks the date as "owned by
   *   the defaults flow", which controls whether the mini-cal shows it
   *   in full color (defaults-owned) or lighter (editor-owned) AND
   *   whether performClearDay preserves or deletes the day.
   *
   * Behavior:
   * - Clicking a blank date creates a fresh day stamped with this type
   *   and adds the date to the defaults set.
   * - Clicking a date tagged with a DIFFERENT type swaps the type and
   *   adds the date to the defaults set (transferring ownership).
   * - Clicking a date that already matches this type AND is in the
   *   defaults set toggles off - removes from the defaults set AND
   *   deletes the day entirely.
   * - Clicking a date that already matches this type but is ONLY
   *   editor-owned promotes it into the defaults set without changing
   *   the day's content.
   */
  function assignEventTypeToDate(typeId: string, iso: IsoDate) {
    pushUndoImmediate();
    const existing = doc.schedule[iso];
    const inDefaults = isInDefaults(iso);

    if (existing && existing.eventTypeId === typeId && inDefaults) {
      // Toggle off: clear both schedule and the defaults ownership flag.
      const next = { ...doc.schedule };
      delete next[iso];
      doc.schedule = next;
      removeFromDefaults(iso);
      return;
    }

    if (existing) {
      doc.schedule[iso] = { ...existing, eventTypeId: typeId };
      addToDefaults(iso);
      return;
    }

    const seeded = emptyDay(iso);
    seeded.eventTypeId = typeId;
    doc.schedule[iso] = seeded;
    addToDefaults(iso);
  }

  /**
   * Attempt to edit show metadata. In read-only mode (demo), fires the
   * paywall callback. In paid mode, no-ops (the editor is fully unlocked).
   */
  function tryToEdit() {
    if (readOnly) onPaywall?.();
  }

  async function tryToSave() {
    await onSave?.(doc);
  }

  function openConflictRequest() {
    if (doc.cast.length === 0 && doc.crew.length === 0) {
      showToast("Add cast or crew to use this");
      return;
    }
    conflictRequestOpen = true;
  }

  // ---- Pending conflict submissions tracking ----
  // Mirror of the hashString + showToken logic inside ConflictRequestModal
  // so the toolbar icon can reflect pending submissions without having to
  // open the modal first. If the hash algorithm changes, update both.
  function hashConflictToken(s: string): string {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return Math.abs(h).toString(36).padStart(6, "0").slice(0, 8);
  }
  const conflictShowToken = $derived(
    hashConflictToken(doc.show.name + doc.show.startDate),
  );
  const conflictSubmissionsKey = $derived(
    `rehearsal-block:conflict-submissions:${conflictShowToken}`,
  );

  function refreshPendingConflictCount() {
    if (typeof window === "undefined") {
      pendingConflictCount = 0;
      return;
    }
    try {
      const raw = localStorage.getItem(conflictSubmissionsKey);
      if (!raw) {
        pendingConflictCount = 0;
        return;
      }
      const parsed = JSON.parse(raw);
      pendingConflictCount = Array.isArray(parsed) ? parsed.length : 0;
    } catch {
      pendingConflictCount = 0;
    }
  }

  onMount(() => {
    refreshPendingConflictCount();
    const handler = (e: StorageEvent) => {
      if (e.key === conflictSubmissionsKey) refreshPendingConflictCount();
    };
    window.addEventListener("storage", handler);

    /* Mobile defaults + sticky prefs. On first mobile visit (no stored
       prefs), default to list view with both sidebars collapsed so users
       see something usable instead of a broken calendar grid. Subsequent
       visits read whatever the user last chose. Desktop visits don't
       touch any of this. */
    const isMobile = window.matchMedia("(max-width: 768px)").matches;
    if (isMobile) {
      try {
        const raw = localStorage.getItem(MOBILE_PREFS_KEY);
        if (raw) {
          const prefs = JSON.parse(raw) as {
            viewMode?: "calendar" | "list";
            scopeMode?: ScopeMode;
            sidebarCollapsed?: boolean;
            rightSidebarCollapsedPref?: boolean;
          };
          if (prefs.viewMode === "list" || prefs.viewMode === "calendar") {
            viewMode = prefs.viewMode;
          }
          if (
            prefs.scopeMode === "auto" ||
            prefs.scopeMode === "month" ||
            prefs.scopeMode === "week" ||
            prefs.scopeMode === "day"
          ) {
            scopeMode = prefs.scopeMode;
          }
          if (typeof prefs.sidebarCollapsed === "boolean") {
            sidebarCollapsed = prefs.sidebarCollapsed;
          }
          if (typeof prefs.rightSidebarCollapsedPref === "boolean") {
            rightSidebarCollapsedPref = prefs.rightSidebarCollapsedPref;
          }
        } else {
          viewMode = "list";
          scopeMode = "auto";
          sidebarCollapsed = true;
          rightSidebarCollapsedPref = true;
        }
      } catch {
        /* localStorage may be unavailable; use defaults */
      }
    }
    mobilePrefsHydrated = true;

    return () => window.removeEventListener("storage", handler);
  });

  /* Persist mobile prefs whenever any of the tracked values change.
     Gated on the hydration flag so the initial default-value read
     doesn't overwrite stored prefs before onMount loads them. Also
     gated on viewport so desktop changes don't affect mobile prefs. */
  $effect(() => {
    if (!mobilePrefsHydrated) return;
    if (typeof window === "undefined") return;
    if (!window.matchMedia("(max-width: 768px)").matches) return;
    try {
      localStorage.setItem(
        MOBILE_PREFS_KEY,
        JSON.stringify({
          viewMode,
          scopeMode,
          sidebarCollapsed,
          rightSidebarCollapsedPref,
        }),
      );
    } catch {
      /* localStorage may be unavailable */
    }
  });

  // Re-read when the token changes (e.g. show name/start date edited)
  $effect(() => {
    // Tracking conflictSubmissionsKey for reactivity
    const _key = conflictSubmissionsKey;
    refreshPendingConflictCount();
  });

  function acceptConflictSubmission(incoming: Conflict[]) {
    if (incoming.length === 0) return;
    pushUndoImmediate();
    // Filter out any incoming conflicts that duplicate existing ones by
    // (actorId + date) since the actor might resubmit after a prior accept.
    const existingKeys = new Set(
      doc.conflicts.map((c) => `${c.actorId}:${c.date}:${c.startTime ?? ""}:${c.endTime ?? ""}`),
    );
    const toAdd = incoming.filter(
      (c) => !existingKeys.has(`${c.actorId}:${c.date}:${c.startTime ?? ""}:${c.endTime ?? ""}`),
    );
    doc.conflicts = [...doc.conflicts, ...toAdd];
    const actor = doc.cast.find((m) => m.id === incoming[0].actorId)
      ?? doc.crew.find((m) => m.id === incoming[0].actorId);
    const name = actor ? actor.firstName : "the actor";
    showToast(
      toAdd.length === 0
        ? "Already had these conflicts"
        : `Added ${toAdd.length} conflict${toAdd.length === 1 ? "" : "s"} from ${name}`,
    );
    // The modal writes to localStorage itself, but same-tab writes don't
    // fire storage events - so refresh manually.
    refreshPendingConflictCount();
  }

  function conflictDisplayLabel(c: Conflict): string {
    const actor = doc.cast.find((m) => m.id === c.actorId);
    const crew = actor ? null : doc.crew.find((m) => m.id === c.actorId);
    const person = actor ?? crew;
    const name = person
      ? `${person.firstName} ${person.lastName}`
      : "Unknown actor";
    const when =
      c.startTime && c.endTime
        ? `${c.startTime}–${c.endTime}`
        : "full rehearsal";
    return c.label ? `${name} · ${when} · ${c.label}` : `${name} · ${when}`;
  }

  async function publish() {
    const wasFirstPublish = !shareId;
    publishing = true;
    try {
      shareId = await publishSchedule(doc, shareId);
      lastPublishedJson = JSON.stringify(doc);
      showToast("Schedule published!");
      if (wasFirstPublish) {
        // Keep the dropdown open on first publish and highlight the
        // Copy Link button so the user can discover it. Subsequent
        // republishes close the dropdown to get out of the way.
        justFirstPublished = true;
      } else {
        shareDropdownOpen = false;
      }
    } catch {
      showToast("Could not publish schedule");
      shareDropdownOpen = false;
    }
    publishing = false;
  }

  // Clear the "just published" highlight whenever the share dropdown
  // closes (by copy, outside click, navigating away, etc).
  $effect(() => {
    if (!shareDropdownOpen) justFirstPublished = false;
  });

  async function copyShareLink() {
    shareDropdownOpen = false;
    if (!shareId) return;
    const url = buildShareUrlFromId(shareId, window.location.origin);
    try {
      await navigator.clipboard.writeText(url);
      showToast("Link copied!");
    } catch {
      window.prompt("Copy this link to share with your cast:", url);
    }
  }

  /** Find calls with a start time but no end time. */
  function findMissingEndTimes(): { date: IsoDate; callIndex: number; label: string; isDressPerf: boolean }[] {
    const missing: { date: IsoDate; callIndex: number; label: string; isDressPerf: boolean }[] = [];
    for (const [iso, day] of Object.entries(doc.schedule)) {
      const et = doc.eventTypes.find((t) => t.id === day.eventTypeId);
      const isDressPerf = et?.isDressPerf ?? false;
      for (let i = 0; i < day.calls.length; i++) {
        const call = day.calls[i];
        if (call.time && !call.endTime) {
          const label = call.label
            ? `${call.label} ${call.suffix ?? "Call"}`
            : et?.name ?? "Call";
          missing.push({ date: iso as IsoDate, callIndex: i, label, isDressPerf });
        }
      }
    }
    return missing.sort((a, b) => a.date.localeCompare(b.date));
  }

  /** Add default end times: 2.5hr for rehearsals, 3.5hr for dress/perf. */
  function autoFillEndTimes() {
    pushUndoImmediate();
    for (const [iso, day] of Object.entries(doc.schedule)) {
      const et = doc.eventTypes.find((t) => t.id === day.eventTypeId);
      const isDressPerf = et?.isDressPerf ?? false;
      const durationMin = isDressPerf ? 210 : 150; // 3.5hr or 2.5hr
      for (const call of day.calls) {
        if (call.time && !call.endTime) {
          const [h, m] = call.time.split(":").map(Number);
          const totalMin = h * 60 + m + durationMin;
          const endH = Math.floor(totalMin / 60) % 24;
          const endM = totalMin % 60;
          call.endTime = `${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}`;
        }
      }
    }
  }

  function exportGcalCsv() {
    const missing = findMissingEndTimes();
    if (missing.length > 0) {
      csvPickerOpen = false;
      csvEndTimeWarningOpen = true;
      return;
    }
    csvPickerOpen = false;
    downloadCsv(doc, {
      mode: "list",
      startDate: doc.show.startDate,
      endDate: doc.show.endDate,
      csvFormat: "gcal",
    });
  }

  /** Map font names to CSS values with appropriate fallbacks. */
  function cssFont(name: string): string {
    if (name === "Century Gothic") return '"Century Gothic", "CenturyGothic", Questrial, sans-serif';
    return name;
  }

  /** Map element size presets to CSS rem values. */
  const SIZE_MAP: Record<string, Record<string, string>> = {
    eventType:   { xs: "0.5em",    sm: "0.5625em", md: "0.6875em", lg: "0.8125em", xl: "0.9375em" },
    time:        { xs: "0.5625em", sm: "0.625em",  md: "0.75em",   lg: "0.875em",  xl: "1em" },
    description: { xs: "0.5em",    sm: "0.5625em", md: "0.6875em", lg: "0.8125em", xl: "0.9375em" },
    castBadge:   { xs: "0.5em",    sm: "0.5625em", md: "0.6875em", lg: "0.8125em", xl: "0.9375em" },
    groupBadge:  { xs: "0.5em",    sm: "0.5625em", md: "0.6875em", lg: "0.8125em", xl: "0.9375em" },
    notes:       { xs: "0.4375em", sm: "0.5em",    md: "0.625em",  lg: "0.75em",   xl: "0.875em" },
    location:    { xs: "0.5em",    sm: "0.5625em", md: "0.6875em", lg: "0.8125em", xl: "0.9375em" },
    conflicts:   { xs: "0.5em",    sm: "0.5625em", md: "0.6875em", lg: "0.8125em", xl: "0.9375em" },
  };

  function elSize(element: string, size: string | undefined): string {
    return SIZE_MAP[element]?.[size ?? "md"] ?? SIZE_MAP[element]?.md ?? "0.6875em";
  }

  function formatHeaderDate(iso: string) {
    const [y, m, d] = iso.split("-").map(Number);
    const dt = new Date(Date.UTC(y!, m! - 1, d!));
    return dt.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    });
  }
</script>

<svelte:window onclick={onWindowClick} onkeydown={onWindowKey} />

<div class="demo-page" class:page-dark={doc.settings.theme === "dark"}>
  <div
    class="demo-inner container"
    class:theme-dark={doc.settings.theme === "dark"}
    class:size-compact={doc.settings.fontSizeScale === "compact"}
    class:size-large={doc.settings.fontSizeScale === "large"}
    style:--font-main={cssFont(doc.settings.fontFamily ?? "Inter")}
    style:--font-heading={cssFont(doc.settings.fontHeading ?? "Playfair Display")}
    style:--font-time={cssFont(doc.settings.fontTime ?? "Inter")}
    style:--font-notes={cssFont(doc.settings.fontNotes ?? "Inter")}
    style:--size-event-type={elSize("eventType", doc.settings.sizeEventType)}
    style:--size-time={elSize("time", doc.settings.sizeTime)}
    style:--size-description={elSize("description", doc.settings.sizeDescription)}
    style:--size-cast-badge={elSize("castBadge", doc.settings.sizeCastBadge)}
    style:--size-group-badge={elSize("groupBadge", doc.settings.sizeGroupBadge)}
    style:--size-notes={elSize("notes", doc.settings.sizeNotes)}
    style:--size-location={elSize("location", doc.settings.sizeLocation)}
    style:--size-conflicts={elSize("conflicts", doc.settings.sizeConflicts)}
    style:--cell-min-height={scopeMode === "day" ? "24rem" : scopeMode === "week" ? "12rem" : "7rem"}
    style:--cell-scale={scopeMode === "day" ? "2" : scopeMode === "week" ? "1.4" : "1"}
  >
    <div class="sticky-bar" bind:this={stickyBarEl}>
      <div class="show-title-line">
        <h1>{doc.show.name}</h1>
        <span class="show-dates">{formatUsDateRange(doc.show.startDate, doc.show.endDate)}</span>
      </div>

      <div class="toolbar">
        {#if showResetButton}
          <div class="toolbar-group">
            <button
              type="button"
              class="toolbar-btn reset-demo-btn"
              title="Reset demo to original"
              aria-label="Reset demo to original"
              onclick={() => onReset?.()}
            >
              <svg width="20" height="20" viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true">
                <path d="M480-160q-134 0-227-93t-93-227q0-134 93-227t227-93q69 0 132 28.5T720-690v-110h80v280H520v-80h168q-32-56-87.5-88T480-720q-100 0-170 70t-70 170q0 100 70 170t170 70q77 0 139-44t87-116h84q-28 106-114 173t-196 67Z"/>
              </svg>
            </button>
          </div>
        {/if}
        <!-- View toggle: single button that flips between calendar and list.
             The icon shows the CURRENT view; clicking switches to the other. -->
        <div class="toolbar-group">
          <button
            type="button"
            class="toolbar-btn"
            class:toolbar-btn-labeled={showToolbarLabels}
            title={viewMode === "calendar" ? "Switch to list mode" : "Switch to calendar mode"}
            aria-label={viewMode === "calendar" ? "Switch to list mode" : "Switch to calendar mode"}
            onclick={() => (viewMode = viewMode === "calendar" ? "list" : "calendar")}
          >
            {#if viewMode === "calendar"}
              <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <rect x="1" y="3" width="14" height="12" rx="2" stroke="currentColor" stroke-width="1.5" fill="none"/>
                <line x1="1" y1="7" x2="15" y2="7" stroke="currentColor" stroke-width="1.5"/>
                <line x1="5.5" y1="3" x2="5.5" y2="15" stroke="currentColor" stroke-width="1"/>
                <line x1="10.5" y1="3" x2="10.5" y2="15" stroke="currentColor" stroke-width="1"/>
                <line x1="1" y1="11" x2="15" y2="11" stroke="currentColor" stroke-width="1"/>
                <line x1="4" y1="1" x2="4" y2="4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                <line x1="12" y1="1" x2="12" y2="4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
              </svg>
              {#if showToolbarLabels}<span class="toolbar-btn-label">Calendar</span>{/if}
            {:else}
              <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <line x1="5" y1="3" x2="14" y2="3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                <line x1="5" y1="8" x2="14" y2="8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                <line x1="5" y1="13" x2="14" y2="13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                <circle cx="2" cy="3" r="1.25" fill="currentColor"/>
                <circle cx="2" cy="8" r="1.25" fill="currentColor"/>
                <circle cx="2" cy="13" r="1.25" fill="currentColor"/>
              </svg>
              {#if showToolbarLabels}<span class="toolbar-btn-label">List</span>{/if}
            {/if}
          </button>
        </div>

        <!-- Scope selector -->
        <div class="toolbar-group">
          <button
            type="button"
            class="toolbar-btn"
            class:toolbar-btn-labeled={showToolbarLabels}
            disabled={scopeMode === "auto"}
            title="Previous"
            aria-label="Previous"
            onclick={() => scopeNav(-1)}
          >
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M10 3L5 8l5 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            {#if showToolbarLabels}<span class="toolbar-btn-label">Prev</span>{/if}
          </button>
          <div class="scope-dropdown-wrap">
            <button
              type="button"
              class="toolbar-btn"
              class:toolbar-btn-labeled={showToolbarLabels}
              class:filter-active={scopeMode !== "auto"}
              title={scopeMode === "auto" ? "View: Overview" : scopeMode === "month" ? "View: Month" : scopeMode === "week" ? "View: Week" : "View: Day"}
              aria-label="Change view scope"
              onclick={(e) => {
                e.stopPropagation();
                scopeDropdownOpen = !scopeDropdownOpen;
                exportDropdownOpen = false;
                shareDropdownOpen = false;
                dateFilterOpen = false;
              }}
            >
              {#if scopeMode === "auto"}
                <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M8.6,11h-4.2c-.66,0-1.22-.18-1.7-.55s-.71-.81-.71-1.32v-3.27c0-.51.23-.95.71-1.32s1.04-.55,1.7-.55h4.2c.66,0,1.22.18,1.7.55s.71.81.71,1.32v3.27c0,.51-.23.95-.71,1.32s-1.04.55-1.7.55ZM4,9h5v-3H4v3Z" fill="currentColor"/>
                  <path d="M19.6,20h-4.2c-.66,0-1.22-.18-1.7-.55s-.71-.81-.71-1.32v-3.27c0-.51.23-.95.71-1.32s1.04-.55,1.7-.55h4.2c.66,0,1.22.18,1.7.55s.71.81.71,1.32v3.27c0,.51-.23.95-.71,1.32s-1.04.55-1.7.55ZM15,18h5v-3h-5v3Z" fill="currentColor"/>
                  <path d="M8.6,20h-4.2c-.66,0-1.22-.18-1.7-.55s-.71-.81-.71-1.32v-3.27c0-.51.23-.95.71-1.32s1.04-.55,1.7-.55h4.2c.66,0,1.22.18,1.7.55s.71.81.71,1.32v3.27c0,.51-.23.95-.71,1.32s-1.04.55-1.7.55ZM4,18h5v-3H4v3Z" fill="currentColor"/>
                  <path d="M19.6,11h-4.2c-.66,0-1.22-.18-1.7-.55s-.71-.81-.71-1.32v-3.27c0-.51.23-.95.71-1.32s1.04-.55,1.7-.55h4.2c.66,0,1.22.18,1.7.55s.71.81.71,1.32v3.27c0,.51-.23.95-.71,1.32s-1.04.55-1.7.55ZM15,9h5v-3h-5v3Z" fill="currentColor"/>
                </svg>
              {:else if scopeMode === "month"}
                <svg width="18" height="18" viewBox="0 -960 960 960" aria-hidden="true">
                  <path d="M160-160q-33 0-56.5-23.5T80-240v-480q0-33 23.5-56.5T160-800h640q33 0 56.5 23.5T880-720v480q0 33-23.5 56.5T800-160H160Zm0-360h160v-200H160v200Zm240 0h160v-200H400v200Zm240 0h160v-200H640v200ZM320-240v-200H160v200h160Zm80 0h160v-200H400v200Zm240 0h160v-200H640v200Z" fill="currentColor"/>
                </svg>
              {:else if scopeMode === "week"}
                <svg width="18" height="18" viewBox="0 -960 960 960" aria-hidden="true">
                  <path d="M160-240h160v-480H160v480Zm240 0h160v-480H400v480Zm240 0h160v-480H640v480Zm-480 80q-33 0-56.5-23.5T80-240v-480q0-33 23.5-56.5T160-800h640q33 0 56.5 23.5T880-720v480q0 33-23.5 56.5T800-160H160Z" fill="currentColor"/>
                </svg>
              {:else}
                <svg width="18" height="18" viewBox="0 -960 960 960" aria-hidden="true">
                  <path d="M200-280q-33 0-56.5-23.5T120-360v-240q0-33 23.5-56.5T200-680h560q33 0 56.5 23.5T840-600v240q0 33-23.5 56.5T760-280H200Zm0-80h560v-240H200v240Zm-80-400v-80h720v80H120Zm0 640v-80h720v80H120Zm80-480v240-240Z" fill="currentColor"/>
                </svg>
              {/if}
              {#if showToolbarLabels}
                <span class="toolbar-btn-label">
                  {scopeMode === "auto" ? "Overview" : scopeMode === "month" ? "Month" : scopeMode === "week" ? "Week" : "Day"}
                </span>
              {/if}
            </button>
            {#if scopeDropdownOpen}
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <div class="scope-dropdown" onclick={(e) => e.stopPropagation()}>
                {#each [
                  { value: "auto", label: "Overview" },
                  { value: "month", label: "Month" },
                  { value: "week", label: "Week" },
                  { value: "day", label: "Day" },
                ] as opt (opt.value)}
                  <button
                    type="button"
                    class="scope-option"
                    class:active={scopeMode === opt.value}
                    onclick={() => {
                      scopeMode = opt.value as ScopeMode;
                      scopeDropdownOpen = false;
                      if (scopeMode !== "auto") {
                        if (selectedDate && selectedDate >= doc.show.startDate && selectedDate <= doc.show.endDate) {
                          scopeAnchor = selectedDate;
                        } else if (!scopeAnchor || scopeAnchor < doc.show.startDate) {
                          scopeAnchor = doc.show.startDate;
                        }
                      }
                    }}
                  >
                    {opt.label}
                  </button>
                {/each}
              </div>
            {/if}
          </div>
          <button
            type="button"
            class="toolbar-btn"
            class:toolbar-btn-labeled={showToolbarLabels}
            disabled={scopeMode === "auto"}
            title="Next"
            aria-label="Next"
            onclick={() => scopeNav(1)}
          >
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M6 3l5 5-5 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            {#if showToolbarLabels}<span class="toolbar-btn-label">Next</span>{/if}
          </button>
        </div>

        <!-- Filter (icon-only) with unified filter dropdown -->
        <div class="toolbar-group">
          <div class="date-filter-wrap">
            <button
              type="button"
              class="toolbar-btn"
              class:toolbar-btn-labeled={showToolbarLabels}
              class:filter-active={hasAnyFilter}
              title={hasAnyFilter ? "Filters active" : "Filter"}
              aria-label="Filter"
              onclick={(e) => {
                e.stopPropagation();
                dateFilterOpen = !dateFilterOpen;
                exportDropdownOpen = false;
                shareDropdownOpen = false;
                scopeDropdownOpen = false;
              }}
            >
              <svg width="16" height="16" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <line x1="1" y1="3.5" x2="13" y2="3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                <line x1="1" y1="7" x2="13" y2="7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                <line x1="1" y1="10.5" x2="13" y2="10.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                <circle cx="4" cy="3.5" r="1.5" fill="currentColor"/>
                <circle cx="10" cy="7" r="1.5" fill="currentColor"/>
                <circle cx="6" cy="10.5" r="1.5" fill="currentColor"/>
              </svg>
              {#if showToolbarLabels}<span class="toolbar-btn-label">Filter</span>{/if}
            </button>
            {#if dateFilterOpen}
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <div class="filter-dropdown" onclick={(e) => e.stopPropagation()}>
                <div class="filter-dropdown-header">
                  <span>Filter</span>
                  {#if hasAnyFilter}
                    <button type="button" class="filter-clear-all-btn" onclick={clearAllFilters}>
                      Clear all
                    </button>
                  {/if}
                </div>

                <!-- Date range filter -->
                <div class="filter-section">
                  <button
                    type="button"
                    class="filter-section-title"
                    aria-expanded={filterDateExpanded}
                    onclick={() => (filterDateExpanded = !filterDateExpanded)}
                  >
                    <svg class="filter-section-chevron" class:expanded={filterDateExpanded} width="10" height="10" viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true">
                      <path d="M504-480 320-664l56-56 240 240-240 240-56-56 184-184Z"/>
                    </svg>
                    <span>Date range</span>
                    {#if hasDateFilter}
                      <span class="filter-section-count">·</span>
                      <span
                        class="filter-section-clear"
                        role="button"
                        tabindex="0"
                        onclick={(e) => { e.stopPropagation(); dateFilterStart = ""; dateFilterEnd = ""; }}
                        onkeydown={(e) => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); dateFilterStart = ""; dateFilterEnd = ""; } }}
                      >
                        Clear
                      </span>
                    {/if}
                  </button>
                  {#if filterDateExpanded}
                    <div class="filter-row">
                      <label class="filter-field">
                        <span>From</span>
                        <input
                          type="date"
                          value={dateFilterStart || doc.show.startDate}
                          min={doc.show.startDate}
                          max={doc.show.endDate}
                          onchange={(e) => (dateFilterStart = e.currentTarget.value as IsoDate)}
                        />
                      </label>
                      <label class="filter-field">
                        <span>To</span>
                        <input
                          type="date"
                          value={dateFilterEnd || doc.show.endDate}
                          min={doc.show.startDate}
                          max={doc.show.endDate}
                          onchange={(e) => (dateFilterEnd = e.currentTarget.value as IsoDate)}
                        />
                      </label>
                    </div>
                  {/if}
                </div>

                <!-- Person filter -->
                <div class="filter-section">
                  <button
                    type="button"
                    class="filter-section-title"
                    aria-expanded={filterPersonExpanded}
                    onclick={() => (filterPersonExpanded = !filterPersonExpanded)}
                  >
                    <svg class="filter-section-chevron" class:expanded={filterPersonExpanded} width="10" height="10" viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true">
                      <path d="M504-480 320-664l56-56 240 240-240 240-56-56 184-184Z"/>
                    </svg>
                    <span>Person</span>
                    {#if hasPersonFilter}
                      <span class="filter-section-count">({filterPersonIds.size})</span>
                      <span
                        class="filter-section-clear"
                        role="button"
                        tabindex="0"
                        onclick={(e) => { e.stopPropagation(); filterPersonIds = new Set(); }}
                        onkeydown={(e) => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); filterPersonIds = new Set(); } }}
                      >
                        Clear
                      </span>
                    {/if}
                  </button>
                  {#if filterPersonExpanded}
                    <ul class="filter-check-list">
                      {#each doc.cast as m (m.id)}
                        <li>
                          <label class="filter-check-row">
                            <input
                              type="checkbox"
                              checked={filterPersonIds.has(m.id)}
                              onchange={() => togglePersonFilter(m.id)}
                            />
                            <span class="filter-check-dot" style:background={m.color}></span>
                            <span class="filter-check-name">{m.firstName} {m.lastName}</span>
                            {#if m.character}
                              <span class="filter-check-sub">{m.character}</span>
                            {/if}
                          </label>
                        </li>
                      {/each}
                      {#each doc.crew as m (m.id)}
                        <li>
                          <label class="filter-check-row">
                            <input
                              type="checkbox"
                              checked={filterPersonIds.has(m.id)}
                              onchange={() => togglePersonFilter(m.id)}
                            />
                            <span class="filter-check-square" style:background={m.color}></span>
                            <span class="filter-check-name">{m.firstName} {m.lastName}</span>
                            {#if m.role}
                              <span class="filter-check-sub">{m.role}</span>
                            {/if}
                          </label>
                        </li>
                      {/each}
                    </ul>
                  {/if}
                </div>

                <!-- Event type filter -->
                {#if doc.eventTypes.length > 0}
                  <div class="filter-section">
                    <button
                      type="button"
                      class="filter-section-title"
                      aria-expanded={filterEventTypeExpanded}
                      onclick={() => (filterEventTypeExpanded = !filterEventTypeExpanded)}
                    >
                      <svg class="filter-section-chevron" class:expanded={filterEventTypeExpanded} width="10" height="10" viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true">
                        <path d="M504-480 320-664l56-56 240 240-240 240-56-56 184-184Z"/>
                      </svg>
                      <span>Event type</span>
                      {#if hasEventTypeFilter}
                        <span class="filter-section-count">({filterEventTypeIds.size})</span>
                        <span
                          class="filter-section-clear"
                          role="button"
                          tabindex="0"
                          onclick={(e) => { e.stopPropagation(); filterEventTypeIds = new Set(); }}
                          onkeydown={(e) => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); filterEventTypeIds = new Set(); } }}
                        >
                          Clear
                        </span>
                      {/if}
                    </button>
                    {#if filterEventTypeExpanded}
                      <ul class="filter-check-list">
                        {#each doc.eventTypes as et (et.id)}
                          <li>
                            <label class="filter-check-row">
                              <input
                                type="checkbox"
                                checked={filterEventTypeIds.has(et.id)}
                                onchange={() => toggleEventTypeFilter(et.id)}
                              />
                              <span class="filter-check-dot" style:background={et.bgColor ?? "var(--color-text-muted)"}></span>
                              <span class="filter-check-name">{et.name}</span>
                            </label>
                          </li>
                        {/each}
                      </ul>
                    {/if}
                  </div>
                {/if}

                <!-- Location filter -->
                {#if (doc.locationPresetsV2?.length ?? 0) > 0 || doc.locationPresets.length > 0}
                  <div class="filter-section">
                    <button
                      type="button"
                      class="filter-section-title"
                      aria-expanded={filterLocationExpanded}
                      onclick={() => (filterLocationExpanded = !filterLocationExpanded)}
                    >
                      <svg class="filter-section-chevron" class:expanded={filterLocationExpanded} width="10" height="10" viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true">
                        <path d="M504-480 320-664l56-56 240 240-240 240-56-56 184-184Z"/>
                      </svg>
                      <span>Location</span>
                      {#if hasLocationFilter}
                        <span class="filter-section-count">({filterLocationNames.size})</span>
                        <span
                          class="filter-section-clear"
                          role="button"
                          tabindex="0"
                          onclick={(e) => { e.stopPropagation(); filterLocationNames = new Set(); }}
                          onkeydown={(e) => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); filterLocationNames = new Set(); } }}
                        >
                          Clear
                        </span>
                      {/if}
                    </button>
                    {#if filterLocationExpanded}
                      <ul class="filter-check-list">
                        {#each (doc.locationPresetsV2 ?? doc.locationPresets.map((name) => ({ name, color: undefined }))) as loc (loc.name)}
                          <li>
                            <label class="filter-check-row">
                              <input
                                type="checkbox"
                                checked={filterLocationNames.has(loc.name)}
                                onchange={() => toggleLocationFilter(loc.name)}
                              />
                              {#if loc.color}
                                <span class="filter-check-dot" style:background={loc.color}></span>
                              {/if}
                              <span class="filter-check-name">{loc.name}</span>
                            </label>
                          </li>
                        {/each}
                      </ul>
                    {/if}
                  </div>
                {/if}
              </div>
            {/if}
          </div>
        </div>

        <!-- Undo / Redo -->
        <div class="toolbar-group">
          <button
            type="button"
            class="toolbar-btn"
            class:toolbar-btn-labeled={showToolbarLabels}
            disabled={!canUndo}
            title="Undo (Ctrl+Z)"
            aria-label="Undo"
            onclick={undo}
          >
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M4 6l-3 3 3 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
              <path d="M1 9h9a4 4 0 0 1 0 8H8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" fill="none"/>
            </svg>
            {#if showToolbarLabels}<span class="toolbar-btn-label">Undo</span>{/if}
          </button>
          <button
            type="button"
            class="toolbar-btn"
            class:toolbar-btn-labeled={showToolbarLabels}
            disabled={!canRedo}
            title="Redo (Ctrl+Y)"
            aria-label="Redo"
            onclick={redo}
          >
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M12 6l3 3-3 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
              <path d="M15 9H6a4 4 0 0 0 0 8h2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" fill="none"/>
            </svg>
            {#if showToolbarLabels}<span class="toolbar-btn-label">Redo</span>{/if}
          </button>
        </div>

        <!-- Settings / Save / Export / Share -->
        <div class="toolbar-group">
          <button
            type="button"
            class="toolbar-btn"
            class:toolbar-btn-labeled={showToolbarLabels}
            title="Default Settings"
            aria-label="Default Settings"
            onclick={() => (defaultsOpen = true)}
          >
            <svg width="18" height="18" viewBox="0 -960 960 960" aria-hidden="true">
              <path d="m370-80-16-128q-13-5-24.5-12T307-235l-119 50L78-375l103-78q-1-7-1-13.5v-27q0-6.5 1-13.5L78-585l110-190 119 50q11-8 23-15t24-12l16-128h220l16 128q13 5 24.5 12t22.5 15l119-50 110 190-103 78q1 7 1 13.5v27q0 6.5-2 13.5l103 78-110 190-118-50q-11 8-23 15t-24 12L590-80H370Zm70-80h79l14-106q31-8 57.5-23.5T639-327l99 41 39-68-86-65q5-14 7-29.5t2-31.5q0-16-2-31.5t-7-29.5l86-65-39-68-99 42q-22-23-48.5-38.5T533-694l-13-106h-79l-14 106q-31 8-57.5 23.5T321-633l-99-41-39 68 86 64q-5 15-7 30t-2 32q0 16 2 31t7 30l-86 65 39 68 99-42q22 23 48.5 38.5T427-266l13 106Zm42-180q58 0 99-41t41-99q0-58-41-99t-99-41q-59 0-99.5 41T342-480q0 58 40.5 99t99.5 41Zm-2-140Z" fill="currentColor"/>
            </svg>
            {#if showToolbarLabels}<span class="toolbar-btn-label">Settings</span>{/if}
          </button>
          <div class="export-dropdown-wrap">
            <button
              type="button"
              class="toolbar-btn"
              class:toolbar-btn-labeled={showToolbarLabels}
              title="Export"
              aria-label="Export"
              onclick={(e) => {
                e.stopPropagation();
                exportDropdownOpen = !exportDropdownOpen;
                shareDropdownOpen = false;
              }}
            >
              <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M3 10v3a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
                <line x1="8" y1="10" x2="8" y2="2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                <path d="M5.5 4.5L8 2l2.5 2.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
              </svg>
              {#if showToolbarLabels}<span class="toolbar-btn-label">Export</span>{/if}
            </button>
          {#if exportDropdownOpen}
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div class="export-dropdown">
              <button
                type="button"
                class="export-option"
                onclick={() => {
                  exportDropdownOpen = false;
                  exportOpen = true;
                }}
              >
                <strong>Download PDF</strong>
                <span>Configure page settings and download</span>
              </button>
              <button
                type="button"
                class="export-option"
                onclick={() => {
                  exportDropdownOpen = false;
                  printOpen = true;
                }}
              >
                <strong>Print</strong>
                <span>Configure page settings and send to printer</span>
              </button>
              <button
                type="button"
                class="export-option"
                onclick={() => {
                  exportDropdownOpen = false;
                  csvPickerOpen = true;
                }}
              >
                <strong>Export CSV</strong>
                <span>Download as spreadsheet</span>
              </button>
              <button
                type="button"
                class="export-option"
                onclick={() => {
                  exportDropdownOpen = false;
                  contactSheetOpen = true;
                }}
              >
                <strong>Export Contact Sheet</strong>
                <span>Cast and crew info as CSV, Word, or PDF</span>
              </button>
            </div>
          {/if}
        </div>
          <button
            type="button"
            class="toolbar-btn"
            class:toolbar-btn-labeled={showToolbarLabels}
            class:needs-attention={pendingConflictCount > 0}
            title={pendingConflictCount > 0
              ? `Collect conflicts (${pendingConflictCount} pending)`
              : "Collect conflicts"}
            aria-label="Collect conflicts"
            onclick={openConflictRequest}
          >
            <svg width="18" height="18" viewBox="0 -960 960 960" aria-hidden="true">
              <path d="M200-80q-33 0-56.5-23.5T120-160v-560q0-33 23.5-56.5T200-800h40v-80h80v80h320v-80h80v80h40q33 0 56.5 23.5T840-720v244q-19-9-39-15.5t-41-9.5v-59H200v400h252q7 22 16.5 42T491-80H200Zm0-560h560v-80H200v80Zm0 0v-80 80Zm460 520L528-252l56-56 76 76 152-152 56 56-208 208Z" fill="currentColor"/>
            </svg>
            {#if showToolbarLabels}<span class="toolbar-btn-label">Collect</span>{/if}
          </button>
        <div class="export-dropdown-wrap">
          <button
            type="button"
            class="toolbar-btn"
            class:toolbar-btn-labeled={showToolbarLabels}
            class:needs-attention={hasUnpublishedChanges}
            title={hasUnpublishedChanges ? "Share (unpublished changes)" : "Share"}
            aria-label="Share"
            onclick={(e) => {
              e.stopPropagation();
              shareDropdownOpen = !shareDropdownOpen;
              exportDropdownOpen = false;
            }}
          >
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M14 2L7 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
              <path d="M14 2l-4 13-2.5-5.5L2 7z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" fill="none"/>
            </svg>
            {#if showToolbarLabels}<span class="toolbar-btn-label">Share</span>{/if}
          </button>
          {#if shareDropdownOpen}
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div class="export-dropdown" onclick={(e) => e.stopPropagation()}>
              <button
                type="button"
                class="export-option"
                onclick={publish}
                disabled={publishing}
              >
                <strong>{publishing ? "Publishing..." : "Publish"}</strong>
                <span>{shareId ? "Push latest changes to your cast" : "Create a read-only link for your cast"}</span>
              </button>
              <button
                type="button"
                class="export-option"
                class:highlighted={justFirstPublished}
                onclick={copyShareLink}
                disabled={!shareId}
              >
                <strong>Copy Link</strong>
                <span>{shareId ? "Copy the share URL to clipboard" : "Publish first to get a link"}</span>
              </button>
              {#if showDemoBanners}
              <div class="share-demo-note">
                Demo mode - link is a snapshot. In the full version, republishing updates the link live for your cast.
              </div>
              {/if}
            </div>
          {/if}
        </div>
          {#if onHistory}
            <button
              type="button"
              class="toolbar-btn"
              class:toolbar-btn-labeled={showToolbarLabels}
              title="Version history"
              aria-label="Version history"
              onclick={() => onHistory?.()}
            >
              <svg width="18" height="18" viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true">
                <path d="M480-120q-138 0-240.5-91.5T122-440h82q14 104 92.5 172T480-200q117 0 198.5-81.5T760-480q0-117-81.5-198.5T480-760q-69 0-129 32t-101 88h110v80H120v-240h80v94q51-64 124.5-99T480-840q75 0 140.5 28.5t114 77q48.5 48.5 77 114T840-480q0 75-28.5 140.5t-77 114q-48.5 48.5-114 77T480-120Zm112-192L440-464v-216h80v184l128 128-56 56Z"/>
              </svg>
              {#if showToolbarLabels}<span class="toolbar-btn-label">History</span>{/if}
            </button>
          {/if}
          <button
            type="button"
            class="toolbar-btn save-btn"
            class:toolbar-btn-labeled={showToolbarLabels}
            class:save-pending={syncStatus === "pending" || syncStatus === "syncing"}
            class:save-error={syncStatus === "error"}
            class:save-offline={syncStatus === "offline"}
            title={syncStatus === "synced" ? "Saved to cloud" : syncStatus === "pending" || syncStatus === "syncing" ? "Syncing to cloud..." : syncStatus === "error" ? "Cloud sync failed - click to retry" : syncStatus === "offline" ? "Offline - saved locally, will sync when reconnected" : "Save"}
            aria-label="Save"
            onclick={tryToSave}
          >
            {#if syncStatus === "pending" || syncStatus === "syncing" || syncStatus === "offline"}
              <svg class="spinner" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-dasharray="50 20" />
              </svg>
            {:else if syncStatus === "error"}
              <svg class="save-error-icon" width="18" height="18" viewBox="0 -960 960 960" aria-hidden="true">
                <path d="M480-280q17 0 28.5-11.5T520-320q0-17-11.5-28.5T480-360q-17 0-28.5 11.5T440-320q0 17 11.5 28.5T480-280Zm-40-160h80v-240h-80v240Zm40 360q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Z" fill="currentColor"/>
              </svg>
            {:else}
              <svg width="18" height="18" viewBox="0 -960 960 960" aria-hidden="true">
                <path d="M260-160q-91 0-155.5-63T40-377q0-78 47-139t123-78q25-92 100-149t170-57q117 0 198.5 81.5T760-520q69 8 114.5 59.5T920-340q0 75-52.5 127.5T740-160H520q-33 0-56.5-23.5T440-240v-206l-64 62-56-56 160-160 160 160-56 56-64-62v206h220q42 0 71-29t29-71q0-42-29-71t-71-29h-60v-80q0-83-58.5-141.5T480-720q-83 0-141.5 58.5T280-520h-20q-58 0-99 41t-41 99q0 58 41 99t99 41h100v80H260Zm220-280Z" fill="currentColor"/>
              </svg>
            {/if}
            {#if showToolbarLabels}<span class="toolbar-btn-label">Save</span>{/if}
          </button>
        </div>
    </div>
    </div>

    <div
      class="scheduler"
      class:editor-open={dayEditorOpen}
      class:sidebar-collapsed={sidebarCollapsed}
      class:right-sidebar-collapsed={rightSidebarCollapsed && !dayEditorOpen}
    >
      <div class="scheduler-sidebar">
        <Sidebar
          show={doc}
          oneditcast={() => (castEditorOpen = true)}
          onsetcastdisplaymode={setCastDisplayMode}
          onsetcrewdisplaymode={(mode) => { doc.settings = { ...doc.settings, crewDisplayMode: mode }; }}
          onaddgroup={addGroup}
          onaddgroupblocked={tryToEdit}
          editGroupLocked={readOnly}
          onupdategroup={updateGroup}
          onremovegroup={removeGroup}
          collapsed={sidebarCollapsed}
          oncollapsetoggle={() => (sidebarCollapsed = !sidebarCollapsed)}
          onchangeallcalled={(patch) => {
            pushUndoImmediate();
            const next = { ...doc.settings };
            if (patch.label !== undefined) next.allCalledLabel = patch.label;
            if (patch.color !== undefined) next.allCalledColor = patch.color;
            if (patch.visible !== undefined) next.allCalledVisible = patch.visible;
            doc.settings = next;
          }}
        />
      </div>
      <div class="scheduler-grid">
        {#if viewMode === "calendar"}
          <CalendarGrid
            show={doc}
            {selectedDate}
            {selectedDates}
            onselectday={selectDay}
            onremoveactor={removeActorFromCall}
            onremovecrew={removeCrewFromCall}
            onremovegroup={removeGroupFromCall}
            onremoveallcalled={removeAllCalledFromCall}
            ondropactor={dropActorOnDate}
            ondropcrew={dropCrewOnDate}
            ondropgroup={dropGroupOnDate}
            ondropallcalled={dropAllCalledOnDate}
            ondropeventtype={dropEventTypeOnDate}
            ondroplocation={dropLocationOnDate}
            ondropcall={dropCallOnDate}
            ondropnote={dropNoteOnDate}
            onmoveactor={moveActorBetweenCalls}
            onmovecrew={moveCrewBetweenCalls}
            onmovegroup={moveGroupBetweenCalls}
            onmoveallcalled={moveAllCalledBetweenCalls}
            onremoveeventtype={removeEventTypeFromDay}
            onremovecall={removeCallFromDay}
            onremovenotes={removeNotesFromDay}
            onremovedaylocation={removeLocationFromDay}
            filterStart={effectiveFilterStart}
            filterEnd={effectiveFilterEnd}
            excludedDates={filterExcludedDates}
            {inlineEdit}
            onstartinlineedit={startInlineEdit}
            oninlinechange={inlineChange}
            oninlinecallchange={inlineCallChange}
            oncommitinline={commitInlineEdit}
            oncancelinline={cancelInlineEdit}
            dayViewDate={scopeMode === "day" ? (scopeAnchor || doc.show.startDate) : undefined}
          />
        {:else}
          <ListView
            show={doc}
            {selectedDate}
            {selectedDates}
            onselectday={selectDay}
            onremoveactor={removeActorFromCall}
            onremovecrew={removeCrewFromCall}
            onremovegroup={removeGroupFromCall}
            onremoveallcalled={removeAllCalledFromCall}
            ondropactor={dropActorOnDate}
            ondropcrew={dropCrewOnDate}
            ondropgroup={dropGroupOnDate}
            ondropallcalled={dropAllCalledOnDate}
            ondropeventtype={dropEventTypeOnDate}
            ondroplocation={dropLocationOnDate}
            ondropcall={dropCallOnDate}
            ondropnote={dropNoteOnDate}
            onmoveactor={moveActorBetweenCalls}
            onmovecrew={moveCrewBetweenCalls}
            onmovegroup={moveGroupBetweenCalls}
            onmoveallcalled={moveAllCalledBetweenCalls}
            onremoveeventtype={removeEventTypeFromDay}
            onremovecall={removeCallFromDay}
            onremovenotes={removeNotesFromDay}
            onremovedaylocation={removeLocationFromDay}
            filterStart={effectiveFilterStart}
            filterEnd={effectiveFilterEnd}
            excludedDates={filterExcludedDates}
            {inlineEdit}
            onstartinlineedit={startInlineEdit}
            oninlinechange={inlineChange}
            oninlinecallchange={inlineCallChange}
            oncommitinline={commitInlineEdit}
            oncancelinline={cancelInlineEdit}
          />
        {/if}
      </div>
      {#if selectedDate && selectedDay && !inlineEdit}
        <DayEditor
          date={selectedDate}
          day={selectedDay}
          show={doc}
          onchange={updateSelectedDay}
          onaddlocationpreset={addLocationPreset}
          onaddconflict={addConflict}
          onrequestremoveconflict={requestRemoveConflict}
          onreplaceconflict={(oldId, newConflict) => {
            pushUndoImmediate();
            doc.conflicts = doc.conflicts.filter((c) => c.id !== oldId);
            doc.conflicts = [...doc.conflicts, newConflict];
          }}
          onrequestclear={requestClearDay}
          onaddeventtype={addEventType}
          oncopy={copyDayFromEditor}
          onmove={moveDayFromEditor}
          onpaste={pasteDay}
          hasClipboard={!!clipboard}
          allCollapsed={editorAllCollapsed}
          onclose={closeEditor}
        />
      {:else}
        <div class="scheduler-right-sidebar">
          <DayToolSidebar
            show={doc}
            collapsed={rightSidebarCollapsed}
            oncollapsetoggle={() => (rightSidebarCollapsedPref = !rightSidebarCollapsedPref)}
            onaddeventtype={addEventTypeByName}
            onaddlocation={addLocationPreset}
          />
        </div>
      {/if}
    </div>

  </div>
</div>

{#if defaultsOpen}
  <DefaultsModal
    show={doc}
    onchange={updateSettings}
    onaddlocationpreset={addLocationPreset}
    onremovelocationpreset={removeLocationPreset}
    onaddeventtype={addEventType}
    onupdateeventtype={updateEventType}
    onremoveeventtype={removeEventType}
    onreordereventtype={reorderEventType}
    onassigneventtype={assignEventTypeToDate}
    onclose={() => (defaultsOpen = false)}
    onconvertgroups={convertGroups}
    onupdatelocationpreset={updateLocationPreset}
    onreorderlocationpreset={reorderLocationPreset}
    showReadOnly={readOnly}
    contactsLocked={readOnly}
    onpaywall={() => onPaywall?.()}
    onupdateshow={(patch) => { pushUndoImmediate(); doc.show = { ...doc.show, ...patch }; }}
    onaddmember={addCastMember}
    onupdatemember={updateCastMember}
    onremovemember={removeCastMember}
    onreordermember={reorderCastMember}
    onimportcast={importCast}
    onimportconflicts={importConflicts}
    onmovecasttocrew={moveCastToCrew}
    onmovecrewtocast={moveCrewToCast}
    onaddconflict={addConflict}
    onremoveconflict={(id) => { pushUndoImmediate(); doc.conflicts = doc.conflicts.filter((c) => c.id !== id); }}
    onaddcrew={addCrewMember}
    onupdatecrew={updateCrewMember}
    onremovecrew={removeCrewMember}
    onreordercrew={reorderCrewMember}
    onimportcrew={importCrew}
    oncollectconflicts={() => {
      if (doc.cast.length === 0 && doc.crew.length === 0) {
        showToast("Add cast or crew to use this");
        return;
      }
      defaultsOpen = false;
      conflictRequestOpen = true;
    }}
  />
{/if}

{#if exportOpen}
  <ExportModal
    show={doc}
    onclose={() => (exportOpen = false)}
    readOnly={readOnly}
    onpaywall={() => onPaywall?.()}
    onconvertgroups={convertGroups}
  />
{/if}

{#if printOpen}
  <ExportModal
    show={doc}
    onclose={() => (printOpen = false)}
    outputMode="print"
    onconvertgroups={convertGroups}
  />
{/if}

{#if contactSheetOpen}
  <ContactSheetModal
    show={doc}
    onclose={() => (contactSheetOpen = false)}
    readOnly={readOnly}
    onpaywall={() => onPaywall?.()}
  />
{/if}

{#if conflictRequestOpen}
  <ConflictRequestModal
    show={doc}
    onclose={() => {
      conflictRequestOpen = false;
      // Modal may have rejected submissions without accepting - same-tab
      // localStorage writes don't fire storage events, so refresh on close.
      refreshPendingConflictCount();
    }}
    onacceptconflicts={acceptConflictSubmission}
    onchangelockout={(lockoutDate) => {
      pushUndoImmediate();
      doc.settings = { ...doc.settings, conflictLockoutDate: lockoutDate };
    }}
    perRoleLocked={readOnly}
    onpaywall={() => onPaywall?.()}
  />
{/if}

{#if printPickerOpen}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="modal-backdrop" onclick={() => (printPickerOpen = false)}>
    <div class="picker-modal" onclick={(e) => e.stopPropagation()}>
      <h3>Print</h3>
      <div class="picker-options">
        <button
          type="button"
          class="picker-option"
          onclick={() => {
            printPickerOpen = false;
            openPrintWindow(doc, {
              mode: "calendar",
              startDate: weekStartOf(doc.show.startDate, doc.settings.weekStartsOn),
              endDate: doc.show.endDate,
              action: "print",
              pageBreaks: "months",
            });
          }}
        >
          <strong>Calendar</strong>
          <span>Landscape, one month per page</span>
        </button>
        <button
          type="button"
          class="picker-option"
          onclick={() => {
            printPickerOpen = false;
            openPrintWindow(doc, {
              mode: "list",
              startDate: doc.show.startDate,
              endDate: doc.show.endDate,
              action: "print",
              pageBreaks: "months",
            });
          }}
        >
          <strong>List</strong>
          <span>Portrait, day-by-day view</span>
        </button>
      </div>
    </div>
  </div>
{/if}

{#if csvPickerOpen}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="modal-backdrop" onclick={() => (csvPickerOpen = false)}>
    <div class="picker-modal" onclick={(e) => e.stopPropagation()}>
      <h3>Export CSV</h3>
      <div class="picker-options">
        <button
          type="button"
          class="picker-option"
          onclick={() => {
            csvPickerOpen = false;
            downloadCsv(doc, {
              mode: "list",
              startDate: doc.show.startDate,
              endDate: doc.show.endDate,
              csvFormat: "plain",
            });
          }}
        >
          <strong>Spreadsheet</strong>
          <span>Plain CSV for Excel, Sheets, etc.</span>
        </button>
        <button
          type="button"
          class="picker-option"
          onclick={exportGcalCsv}
        >
          <strong>Google Calendar</strong>
          <span>Formatted for Google Calendar import</span>
        </button>
      </div>
    </div>
  </div>
{/if}

{#if csvEndTimeWarningOpen}
  {@const missing = findMissingEndTimes()}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="modal-backdrop" onclick={() => (csvEndTimeWarningOpen = false)}>
    <div class="picker-modal" style="max-width:480px" onclick={(e) => e.stopPropagation()}>
      <h3>Missing end times</h3>
      <p style="font-size:0.875rem;color:var(--color-text-muted);margin-bottom:var(--space-3)">
        {missing.length} call{missing.length === 1 ? "" : "s"} {missing.length === 1 ? "doesn't" : "don't"} have
        end times. Google Calendar needs both start and end to create events.
        Days with no calls (like dark days) are not included in this export.
      </p>
      <ul class="clear-day-list" style="margin-bottom:var(--space-4)">
        {#each missing as m (m.date + m.callIndex)}
          <li>{formatDateShort(m.date)} - {m.label}</li>
        {/each}
      </ul>
      <div class="picker-options">
        <button
          type="button"
          class="picker-option"
          onclick={() => {
            csvEndTimeWarningOpen = false;
          }}
        >
          <strong>Go back and fix</strong>
          <span>Add end times manually in the editor</span>
        </button>
        <button
          type="button"
          class="picker-option"
          onclick={() => {
            autoFillEndTimes();
            csvEndTimeWarningOpen = false;
            downloadCsv(doc, {
              mode: "list",
              startDate: doc.show.startDate,
              endDate: doc.show.endDate,
              csvFormat: "gcal",
            });
          }}
        >
          <strong>Auto-fill and export</strong>
          <span>Rehearsals: 2.5 hours, Dress/Perf: 3.5 hours</span>
        </button>
      </div>
    </div>
  </div>
{/if}

{#if showEditorOpen}
  <ShowEditorModal
    show={doc}
    onupdateshow={updateShow}
    onclose={() => (showEditorOpen = false)}
  />
{/if}

{#if dateEditorOpen}
  <DateEditorModal
    show={doc}
    onupdateshow={(patch) => {
      pushUndoImmediate();
      doc.show = { ...doc.show, ...patch };
    }}
    onclose={() => (dateEditorOpen = false)}
  />
{/if}

{#if castEditorOpen}
  <CastEditorModal
    show={doc}
    readOnly
    onaddmember={addCastMember}
    onupdatemember={updateCastMember}
    onremovemember={removeCastMember}
    onreordermember={reorderCastMember}
    onaddconflict={addConflict}
    onremoveconflict={(id) => {
      doc.conflicts = doc.conflicts.filter((c) => c.id !== id);
    }}
    onclose={() => (castEditorOpen = false)}
  />
{/if}

{#if conflictToDelete}
  <div
    class="modal-backdrop"
    role="button"
    tabindex="0"
    onclick={cancelRemoveConflict}
    onkeydown={(e) => e.key === "Escape" && cancelRemoveConflict()}
  >
    <div
      class="modal confirm-modal"
      role="dialog"
      aria-modal="true"
      aria-label="Remove conflict"
      tabindex="-1"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => e.stopPropagation()}
    >
      <h2>Remove this conflict?</h2>
      <p>
        {conflictDisplayLabel(conflictToDelete)} on
        <strong>{formatHeaderDate(conflictToDelete.date)}</strong>
        will be deleted.
      </p>
      <div class="modal-actions">
        <button
          type="button"
          class="btn btn-secondary"
          onclick={cancelRemoveConflict}
        >
          Cancel
        </button>
        <button
          type="button"
          class="btn btn-danger"
          onclick={confirmRemoveConflict}
        >
          Remove conflict
        </button>
      </div>
    </div>
  </div>
{/if}

{#if clearConfirmOpen}
  <div
    class="modal-backdrop"
    role="button"
    tabindex="0"
    onclick={cancelClearDay}
    onkeydown={(e) => e.key === "Escape" && cancelClearDay()}
  >
    <div
      class="modal confirm-modal"
      role="dialog"
      aria-modal="true"
      aria-label="Clear day"
      tabindex="-1"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => e.stopPropagation()}
    >
      <h2>Clear {clearTargetDates.length === 1 ? "this day" : `${clearTargetDates.length} days`}?</h2>
      <p>
        All calls, description, notes, location, and called cast will be
        removed from {clearTargetDates.length === 1 ? "this day" : "these days"}:
      </p>
      <ul class="clear-day-list">
        {#each clearTargetDates as iso (iso)}
          <li>{formatDateShort(iso)}</li>
        {/each}
      </ul>
      <div class="modal-actions">
        <button type="button" class="btn btn-secondary" onclick={cancelClearDay}>
          Cancel
        </button>
        <button type="button" class="btn btn-danger" onclick={performClearDay}>
          Clear {clearTargetDates.length === 1 ? "day" : `${clearTargetDates.length} days`}
        </button>
      </div>
      <p class="confirm-footer">
        Conflicts for this day will <strong>not</strong> be removed.
      </p>
    </div>
  </div>
{/if}

{#if pasteConflict}
  <div
    class="modal-backdrop"
    role="button"
    tabindex="0"
    onclick={cancelPaste}
    onkeydown={(e) => e.key === "Escape" && cancelPaste()}
  >
    <div
      class="modal confirm-modal"
      role="dialog"
      aria-modal="true"
      aria-label="Paste conflict"
      tabindex="-1"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => e.stopPropagation()}
    >
      <h2>
        {clipboard?.isCut ? "Move" : "Paste"} onto
        {pasteConflict.targetDates.length === 1
          ? formatDateShort(pasteConflict.targetDates[0]!)
          : `${pasteConflict.targetDates.length} days`}?
      </h2>
      <p>
        {pasteConflict.targetDates.length === 1
          ? "This day already has content. How do you want to handle it?"
          : "Some of the selected days already have content. How do you want to handle them?"}
      </p>
      <div class="paste-actions">
        <button
          type="button"
          class="btn btn-secondary"
          onclick={cancelPaste}
        >
          Cancel
        </button>
        <button
          type="button"
          class="btn btn-secondary"
          onclick={() => executePaste("merge")}
        >
          Merge calls
        </button>
        <button
          type="button"
          class="btn btn-primary"
          onclick={() => executePaste("replace")}
        >
          Replace
        </button>
      </div>
      <p class="confirm-footer">
        <strong>Replace</strong> overwrites all content.
        <strong>Merge</strong> adds the copied calls alongside the existing ones.
      </p>
    </div>
  </div>
{/if}

<Toast message={toastMessage} ondismiss={() => (toastMessage = "")} />

<!-- Paywall modal removed - handled by parent page -->

<style>
  .demo-page {
    width: 100%;
  }

  .demo-page.page-dark {
    background: #1e1429;
    min-height: 100vh;
  }


  /* The scheduler area is deliberately fluid - it fills the viewport so
     wide monitors don't leave empty margins on either side and narrow
     monitors still give the editor + calendar room to breathe. A generous
     upper cap keeps text lines from stretching absurdly on ultrawides. */
  .demo-inner {
    max-width: 2000px;
    padding-left: var(--space-5);
    padding-right: var(--space-5);
  }

  .demo-banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-4);
    background: var(--color-info-bg);
    border: 1px solid var(--color-teal);
    border-radius: var(--radius-md);
    padding: var(--space-3) var(--space-5);
    margin-bottom: var(--space-5);
  }

  .banner-text {
    color: var(--color-plum);
    font-size: 0.875rem;
  }

  /* Matches the landing page .notify-link in the closing CTA. Teal
   * underlined text link, sits inline with the banner copy. */
  .notify-link {
    display: inline-block;
    margin-left: var(--space-2);
    font: inherit;
    font-size: 0.8125rem;
    background: transparent;
    border: none;
    color: var(--color-teal);
    text-decoration: underline;
    text-underline-offset: 3px;
    cursor: pointer;
    padding: 0;
  }
  .notify-link:hover {
    color: var(--color-plum);
  }

  /* Bottom demo banner: same styling as top, but with top margin
   * to separate it from the scheduler grid above. */
  .demo-banner-bottom {
    margin-top: var(--space-5);
    margin-bottom: 0;
  }

  .sticky-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-4);
    flex-wrap: wrap;
    position: sticky;
    top: 0;
    z-index: 10;
    background: var(--color-bg, #fff);
    padding: var(--space-3) 0;
    margin-bottom: var(--space-3);
    border-bottom: 1px solid var(--color-border);
  }

  .show-title-line {
    display: flex;
    align-items: baseline;
    gap: var(--space-3);
    flex-wrap: wrap;
    min-width: 0;
  }

  .sticky-bar h1 {
    margin: 0;
    font-family: var(--font-heading, var(--font-display));
    font-size: 1.5rem;
    line-height: 1.2;
  }

  .show-dates {
    color: var(--color-text-muted);
    font-size: 0.9375rem;
    margin: 0;
  }

  .toolbar {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    flex-wrap: wrap;
    flex-shrink: 0;
  }

  .toolbar-group {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    padding-right: var(--space-2);
    margin-right: var(--space-1);
    border-right: 1px solid var(--color-border);
  }

  /* On larger screens, give the toolbar more breathing room.
     Mobile keeps the tight gaps so all buttons fit. */
  @media (min-width: 1024px) {
    .toolbar {
      gap: var(--space-2);
    }
    .toolbar-group {
      gap: var(--space-2);
      padding-right: var(--space-4);
      margin-right: var(--space-2);
    }
  }
  @media (min-width: 1400px) {
    .toolbar {
      gap: var(--space-3);
    }
    .toolbar-group {
      gap: var(--space-2);
      padding-right: var(--space-5);
      margin-right: var(--space-3);
    }
  }

  .toolbar-group:last-child {
    border-right: none;
    padding-right: 0;
    margin-right: 0;
  }

  .toolbar-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2.5rem;
    height: 2.5rem;
    padding: 0;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: var(--color-surface);
    color: var(--color-text-muted);
    cursor: pointer;
    transition:
      background var(--transition-fast),
      color var(--transition-fast),
      border-color var(--transition-fast);
  }

  /* Labeled variant: icon + text label next to it. Wider, auto-sized
   * to fit the label, gap between icon and text. Used when the
   * "Toolbar text labels" setting is enabled. */
  .toolbar-btn.toolbar-btn-labeled {
    width: auto;
    padding: 0 var(--space-3);
    gap: var(--space-2);
  }
  .toolbar-btn-label {
    font-size: 0.8125rem;
    font-weight: 600;
    white-space: nowrap;
  }

  .toolbar-btn:hover:not(:disabled) {
    border-color: var(--color-teal);
    color: var(--color-text);
  }

  .toolbar-btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  /* Save button sync status indicators */
  .save-btn {
    position: relative;
  }
  .reset-demo-btn {
    color: var(--color-teal) !important;
    border-color: var(--color-teal) !important;
  }
  .reset-demo-btn:hover {
    background: var(--color-info-bg) !important;
  }

  .save-pending {
    color: var(--color-teal) !important;
  }
  .save-error {
    color: var(--color-danger) !important;
  }
  .save-offline {
    color: var(--color-teal) !important;
  }
  .spinner {
    animation: spin 1s linear infinite;
  }
  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  .toolbar-btn.filter-active {
    border-color: var(--color-teal) !important;
    color: var(--color-teal) !important;
  }

  .toolbar-btn.needs-attention {
    background: var(--color-teal);
    color: #fff;
    border-color: var(--color-teal);
  }

  .toolbar-btn.needs-attention:hover {
    background: var(--color-teal-dark, #2e6b68);
    border-color: var(--color-teal-dark, #2e6b68);
    color: #fff;
  }

  .scope-dropdown-wrap {
    position: relative;
  }

  .scope-dropdown {
    position: absolute;
    top: calc(100% + 4px);
    left: 50%;
    transform: translateX(-50%);
    z-index: 80;
    background: var(--color-surface);
    border: 1px solid var(--color-border-strong);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-lg);
    overflow: hidden;
    min-width: 100px;
  }

  .scope-option {
    display: block;
    width: 100%;
    text-align: left;
    font: inherit;
    font-size: 0.8125rem;
    font-weight: 500;
    padding: var(--space-2) var(--space-3);
    background: transparent;
    border: none;
    color: var(--color-text);
    cursor: pointer;
  }

  .scope-option:hover {
    background: var(--color-bg-alt);
  }

  .scope-option.active {
    color: var(--color-plum);
    font-weight: 700;
  }



  .date-filter-wrap {
    position: relative;
  }

  .filter-dropdown {
    position: absolute;
    top: 100%;
    right: 0;
    margin-top: var(--space-2);
    padding: var(--space-3) var(--space-4);
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-lg);
    z-index: 20;
    width: 320px;
    max-height: calc(100vh - 140px);
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .filter-dropdown-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-bottom: var(--space-2);
    border-bottom: 1px solid var(--color-border);
    font-size: 0.75rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--color-text-subtle);
  }
  .filter-clear-all-btn {
    font: inherit;
    font-size: 0.6875rem;
    font-weight: 600;
    text-transform: none;
    letter-spacing: 0;
    color: var(--color-danger, #dc2626);
    background: transparent;
    border: none;
    cursor: pointer;
    padding: 0;
  }
  .filter-clear-all-btn:hover {
    text-decoration: underline;
  }

  .filter-section {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .filter-section-title {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    width: 100%;
    padding: var(--space-1) 0;
    font: inherit;
    font-size: 0.6875rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--color-text-muted);
    background: transparent;
    border: none;
    cursor: pointer;
    text-align: left;
  }
  .filter-section-title:hover {
    color: var(--color-plum);
  }
  .filter-section-chevron {
    flex-shrink: 0;
    transition: transform var(--transition-fast);
    opacity: 0.7;
  }
  .filter-section-chevron.expanded {
    transform: rotate(90deg);
  }
  .filter-section-count {
    font-weight: 500;
    color: var(--color-text-subtle);
  }
  .filter-section-clear {
    font: inherit;
    font-size: 0.6875rem;
    font-weight: 600;
    text-transform: none;
    letter-spacing: 0;
    color: var(--color-danger, #dc2626);
    background: transparent;
    border: none;
    cursor: pointer;
    padding: 0;
    margin-left: auto;
  }
  .filter-section-clear:hover {
    text-decoration: underline;
  }

  .filter-row {
    display: flex;
    gap: var(--space-3);
  }
  .filter-field {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    flex: 1;
  }
  .filter-field span {
    font-size: 0.625rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--color-text-muted);
  }
  .filter-field input[type="date"] {
    font: inherit;
    font-size: 0.8125rem;
    padding: var(--space-2);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: var(--color-surface);
    color: var(--color-text);
    width: 100%;
  }

  .filter-check-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
    max-height: 180px;
    overflow-y: auto;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    padding: var(--space-1);
  }
  .filter-check-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-1) var(--space-2);
    font-size: 0.8125rem;
    color: var(--color-text);
    cursor: pointer;
    border-radius: var(--radius-sm);
    min-width: 0;
  }
  .filter-check-row:hover {
    background: var(--color-bg-alt);
  }
  .filter-check-row input[type="checkbox"] {
    accent-color: var(--color-plum);
    width: 14px;
    height: 14px;
    margin: 0;
    cursor: pointer;
    flex-shrink: 0;
  }
  .filter-check-dot {
    width: 8px;
    height: 8px;
    border-radius: var(--radius-full);
    flex-shrink: 0;
  }
  .filter-check-square {
    width: 8px;
    height: 8px;
    border-radius: 1px;
    flex-shrink: 0;
  }
  .filter-check-name {
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .filter-check-sub {
    font-size: 0.6875rem;
    color: var(--color-text-muted);
    font-weight: 400;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin-left: auto;
  }

  .export-dropdown-wrap {
    position: relative;
  }

  .export-dropdown {
    position: absolute;
    top: calc(100% + 4px);
    right: 0;
    z-index: 80;
    background: var(--color-surface);
    border: 1px solid var(--color-border-strong);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-lg);
    min-width: 220px;
    overflow: hidden;
  }

  .export-option {
    display: flex;
    flex-direction: column;
    gap: 2px;
    width: 100%;
    padding: var(--space-3) var(--space-4);
    background: transparent;
    border: none;
    border-bottom: 1px solid var(--color-border);
    text-align: left;
    cursor: pointer;
    font: inherit;
    transition: background var(--transition-fast);
  }
  .export-option:last-child {
    border-bottom: none;
  }
  .export-option:hover:not(:disabled) {
    background: var(--color-bg-alt);
  }
  .export-option:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  .export-option strong {
    font-size: 0.875rem;
    color: var(--color-text);
  }
  .export-option span {
    font-size: 0.6875rem;
    color: var(--color-text-muted);
  }

  /* Highlighted state for the Copy Link button right after the user
   * publishes for the first time. Draws the user's eye with a teal
   * left border and soft background. */
  .export-option.highlighted {
    background: color-mix(in srgb, var(--color-teal) 10%, transparent);
    border-left: 3px solid var(--color-teal);
    animation: copylink-pulse 1.2s ease-in-out 2;
  }
  .export-option.highlighted strong {
    color: var(--color-teal-dark, var(--color-teal));
  }
  @keyframes copylink-pulse {
    0%, 100% { background: color-mix(in srgb, var(--color-teal) 10%, transparent); }
    50% { background: color-mix(in srgb, var(--color-teal) 22%, transparent); }
  }

  .share-demo-note {
    padding: var(--space-2) var(--space-4);
    font-size: 0.6875rem;
    color: var(--color-text-subtle);
    font-style: italic;
    border-top: 1px solid var(--color-border);
  }

  .picker-modal {
    background: var(--color-surface);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-lg);
    padding: var(--space-5);
    min-width: 300px;
    max-width: 400px;
    cursor: default;
  }

  .picker-modal h3 {
    font-family: var(--font-display);
    color: var(--color-plum);
    font-size: 1.125rem;
    margin: 0 0 var(--space-4);
  }

  .picker-options {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .picker-option {
    display: flex;
    flex-direction: column;
    gap: 2px;
    width: 100%;
    padding: var(--space-3) var(--space-4);
    background: var(--color-bg-alt);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    text-align: left;
    cursor: pointer;
    font: inherit;
    transition: border-color var(--transition-fast), background var(--transition-fast);
  }
  .picker-option:hover {
    border-color: var(--color-teal);
    background: var(--color-surface);
  }
  .picker-option strong {
    font-size: 0.875rem;
    color: var(--color-text);
  }
  .picker-option span {
    font-size: 0.75rem;
    color: var(--color-text-muted);
  }

  .scheduler {
    display: grid;
    /* Default: left sidebar + grid + right tool sidebar. The third
     *  column flexes between the day-tool palette (default), the day
     *  editor (when a day is selected), or a 32px collapse strip.
     *  No transition: grid-template-columns can't reliably interpolate
     *  between minmax() and literal length values, so swapping shapes
     *  leaves the grid stuck mid-animation. Snap instead. */
    grid-template-columns: 180px minmax(0, 1fr) minmax(200px, 220px);
    gap: var(--space-5);
    align-items: start;
  }

  .scheduler.right-sidebar-collapsed {
    /* Third track stays in minmax() shape so the transition between
     *  expanded and collapsed can interpolate. Mixing minmax() and a
     *  literal length breaks the animation. */
    grid-template-columns: 180px minmax(0, 1fr) minmax(32px, 32px);
  }

  .scheduler.editor-open {
    grid-template-columns: 180px minmax(0, 1fr) minmax(360px, 440px);
  }

  .scheduler.sidebar-collapsed {
    grid-template-columns: 32px minmax(0, 1fr) minmax(200px, 220px);
    gap: var(--space-3);
  }

  .scheduler.sidebar-collapsed.right-sidebar-collapsed {
    grid-template-columns: 32px minmax(0, 1fr) minmax(32px, 32px);
    gap: var(--space-3);
  }

  .scheduler.sidebar-collapsed.editor-open {
    grid-template-columns: 32px minmax(0, 1fr) minmax(360px, 440px);
  }

  .scheduler-sidebar {
    position: sticky;
    /* Stick below the page's sticky top bar (show title + toolbar row).
     * --sticky-bar-height is set by a ResizeObserver on the sticky bar. */
    top: calc(var(--sticky-bar-height, 65px) + var(--space-2));
    max-height: calc(100vh - var(--sticky-bar-height, 65px) - var(--space-5));
    overflow-y: auto;
    overflow-x: hidden;
    padding-right: var(--space-2);
  }

  .scheduler.sidebar-collapsed .scheduler-sidebar {
    padding-right: 0;
  }

  .scheduler-right-sidebar {
    position: sticky;
    top: calc(var(--sticky-bar-height, 65px) + var(--space-2));
    max-height: calc(100vh - var(--sticky-bar-height, 65px) - var(--space-5));
    overflow-y: auto;
    overflow-x: hidden;
    padding-left: var(--space-2);
  }

  .scheduler.right-sidebar-collapsed .scheduler-right-sidebar {
    padding-left: 0;
  }

  .scheduler-grid {
    min-width: 0;
  }

  /* ---- Font settings ---- */
  .demo-inner {
    font-family: var(--font-main), system-ui, sans-serif;
  }


  .demo-inner :global(.time),
  .demo-inner :global(.dp-cell-time),
  .demo-inner :global(.curtain-time) {
    font-family: var(--font-time), system-ui, sans-serif;
  }

  .demo-inner :global(.notes-line),
  .demo-inner :global(.notes-text),
  .demo-inner :global(.rt-editor) {
    font-family: var(--font-notes), system-ui, sans-serif;
  }

  /* ---- Size scale ---- */
  .demo-inner.size-compact {
    font-size: 0.875em;
  }
  .demo-inner.size-compact :global(.cell) {
    min-height: 5.5rem;
    padding: var(--space-1);
  }
  .demo-inner.size-compact :global(.week) {
    gap: var(--space-1);
  }

  .demo-inner.size-large {
    font-size: 1.125em;
  }
  .demo-inner.size-large :global(.cell) {
    min-height: 9rem;
    padding: var(--space-3);
  }

  /* ---- Theme: Dark (plum-based) ----
     Uses the BRY Theatrics brand plum (#2d1f3d) as the foundation.
     Surfaces step lighter through the purple-grey range so the
     hierarchy reads: page bg -> card bg -> surface -> border. */
  .demo-inner.theme-dark {
    --color-bg: #1e1429;
    --color-bg-alt: #2d1f3d;
    --color-surface: #362848;
    --color-border: #4a3860;
    --color-border-strong: #5c4a72;
    --color-text: #e8e4ed;
    --color-text-muted: #a8a0b4;
    --color-text-subtle: #7a7088;
    --color-text-inverse: #1e1429;
    --color-plum: #d0c8d8;
    --color-plum-light: #e0d8e8;
    --color-teal: #2e9a8f;
    --color-teal-dark: #3aa69a;
    --color-info-bg: #1e2d2b;
    --color-danger-bg: #2e1a1e;
    --color-warning-bg: #2e2a1e;
    --color-danger: #ef5350;
    --color-warning: #ffb74d;
    color: var(--color-text);
    background: var(--color-bg);
    border-radius: var(--radius-lg);
    padding: var(--space-5);
  }

  .demo-inner.theme-dark :global(.cell) {
    background: #362848;
    border-color: #4a3860;
  }
  .demo-inner.theme-dark :global(.cell.placeholder) {
    background: #2d1f3d;
    border-color: #4a3860;
  }
  .demo-inner.theme-dark :global(.cell.selected) {
    border-color: #2e9a8f;
    box-shadow: 0 0 0 2px #2e9a8f;
  }
  .demo-inner.theme-dark :global(.chip) {
    background: #362848;
    border-color: #4a3860;
  }
  .demo-inner.theme-dark :global(.editor) {
    background: #362848;
    border-color: #4a3860;
  }
  .demo-inner.theme-dark :global(.call-card) {
    background: #2d1f3d;
    border-color: #4a3860;
  }
  .demo-inner.theme-dark :global(.weekday-headers) {
    background: #1e1429;
    border-bottom-color: #4a3860;
  }
  .demo-inner.theme-dark :global(.weekday) {
    color: #7a7088;
  }
  .demo-inner.theme-dark :global(.day-number) {
    color: #d0c8d8;
  }
  .demo-inner.theme-dark :global(.badge-group) {
    color: inherit;
  }
  .demo-inner.theme-dark :global(.demo-banner) {
    border-color: #2e9a8f;
    background: #1e2d2b;
    color: #e8e4ed;
  }
  .demo-inner.theme-dark .sticky-bar {
    background: #1e1429;
  }
  .demo-inner.theme-dark .sticky-bar h1 {
    color: #d0c8d8;
  }
  .demo-inner.theme-dark :global(.show-dates) {
    color: #a8a0b4;
  }
  .demo-inner.theme-dark :global(.btn-secondary) {
    color: #e8e4ed;
    border-color: #5c4a72;
  }
  .demo-inner.theme-dark :global(.btn-primary) {
    background: #2e9a8f;
    color: #e8e4ed;
  }
  .demo-inner.theme-dark :global(.loc-pill) {
    opacity: 0.85;
  }
  .demo-inner.theme-dark :global(.sidebar) {
    color: #e8e4ed;
  }
  .demo-inner.theme-dark :global(.mode-toggle) {
    border-color: #4a3860;
    background: #2d1f3d;
  }
  .demo-inner.theme-dark :global(.mode-btn) {
    color: #a8a0b4;
  }
  .demo-inner.theme-dark :global(.mode-btn.active) {
    background: #2e9a8f;
    color: #e8e4ed;
  }
  .demo-inner.theme-dark :global(.all-called-inline) {
    background: #5b1a2b;
  }
  .demo-inner.theme-dark :global(.group-chip) {
    color: #ffffff;
  }
  .demo-inner.theme-dark :global(.drag-hint) {
    color: #7a7088;
  }
  .demo-inner.theme-dark :global(.conflict-footer) {
    background: #2e1a1e;
  }
  .demo-inner.theme-dark :global(.notes-line) {
    color: #a8a0b4;
  }
  .demo-inner.theme-dark :global(.list-day) {
    border-bottom-color: #4a3860;
  }
  .demo-inner.theme-dark :global(.list-day:hover) {
    background: color-mix(in srgb, #2e9a8f 10%, transparent);
  }
  .demo-inner.theme-dark :global(.list-day.selected) {
    background: color-mix(in srgb, #2e9a8f 15%, transparent);
  }
  .demo-inner.theme-dark :global(.day-date) {
    color: #d0c8d8;
  }
  .demo-inner.theme-dark :global(.day-notes) {
    background: #2d1f3d;
    color: #a8a0b4;
  }
  .demo-inner.theme-dark :global(.list-call) {
    border-left-color: #4a3860;
  }
  .demo-inner.theme-dark .toolbar-btn {
    background: #362848;
    border-color: #4a3860;
    color: #a8a0b4;
  }
  .demo-inner.theme-dark .toolbar-btn:hover:not(:disabled) {
    border-color: #2e9a8f;
    color: #e8e4ed;
  }
  .demo-inner.theme-dark .toolbar-btn.filter-active {
    border-color: #2e9a8f !important;
    color: #2e9a8f !important;
  }
  .demo-inner.theme-dark .toolbar-btn.needs-attention {
    background: #2e9a8f;
    color: #fff;
    border-color: #2e9a8f;
  }
  .demo-inner.theme-dark .toolbar-group {
    border-right-color: #4a3860;
  }
  .demo-inner.theme-dark .filter-dropdown {
    background: #362848;
    border-color: #4a3860;
  }
  .demo-inner.theme-dark .filter-field input[type="date"] {
    background: #2d1f3d;
    border-color: #4a3860;
    color: #e8e4ed;
  }
  .demo-inner.theme-dark .filter-check-list {
    border-color: #4a3860;
  }
  .demo-inner.theme-dark .filter-check-row:hover {
    background: #2d1f3d;
  }

  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(45, 31, 61, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
    padding: var(--space-4);
    border: none;
    cursor: pointer;
  }

  .modal {
    background: var(--color-surface);
    border-radius: var(--radius-lg);
    padding: var(--space-6);
    max-width: 480px;
    width: 100%;
    box-shadow: var(--shadow-lg);
    cursor: default;
  }

  .modal h2 {
    margin-top: 0;
    color: var(--color-plum);
  }

  .modal-actions {
    display: flex;
    gap: var(--space-2);
    justify-content: flex-end;
    margin-top: var(--space-5);
  }

  .confirm-modal :global(.btn-danger) {
    background: var(--color-danger);
    color: var(--color-text-inverse);
    border: none;
  }
  .confirm-modal :global(.btn-danger:hover) {
    background: #b91c1c;
  }

  .clear-day-list {
    margin: var(--space-2) 0 var(--space-3);
    padding-left: var(--space-5);
    font-size: 0.875rem;
    color: var(--color-text);
    max-height: 150px;
    overflow-y: auto;
  }
  .clear-day-list li {
    margin-bottom: 2px;
  }

  .paste-actions {
    display: flex;
    gap: var(--space-2);
    justify-content: flex-end;
    margin-top: var(--space-5);
  }

  .confirm-footer {
    margin: var(--space-4) 0 0 0;
    padding-top: var(--space-3);
    border-top: 1px solid var(--color-border);
    font-size: 0.75rem;
    color: var(--color-text-muted);
    font-style: italic;
  }

  @media (max-width: 900px) {
    .scheduler,
    .scheduler.editor-open {
      grid-template-columns: 1fr;
    }
    .scheduler-sidebar {
      position: static;
      max-height: none;
    }
    .demo-banner {
      flex-direction: column;
      align-items: stretch;
    }
  }

  /* ---- Mobile: stack title + toolbar, split toolbar 7+5 ---- */
  @media (max-width: 768px) {
    /* Safety net: the calendar grid cells are 40px wide at phone width
       which is too narrow for their inner content (time pills, location
       pills, group chips). Phase 2 forces list view as the mobile default
       so users don't see this, but if they switch to calendar view we
       clip the overflow instead of letting the whole page scroll.

       NOTE: this MUST live on .scheduler-grid (the inner element that
       actually overflows), NOT on .demo-inner. Putting overflow on
       .demo-inner makes it a containing block for sticky descendants,
       which silently breaks the .sticky-bar's `position: sticky` and
       lets the toolbar scroll off screen on mobile. */
    .scheduler-grid {
      overflow-x: hidden;
    }

    /* Dissolve .sticky-bar into its parent at mobile by using
       `display: contents`. The title + toolbar then behave as direct
       children of .demo-inner for layout, which means the toolbar's
       position:sticky containing block becomes .demo-inner (the full
       page) instead of the tiny .sticky-bar wrapper. This lets the
       toolbar pin to the viewport top for the entire scroll range
       while the title line stays in normal flow above and scrolls
       away naturally. */
    .sticky-bar {
      display: contents;
    }

    .show-title-line {
      justify-content: flex-start;
      padding: var(--space-3) 0 var(--space-2);
      margin: 0;
      flex-wrap: wrap;
    }

    .toolbar {
      justify-content: flex-start;
      position: sticky;
      top: 0;
      z-index: 10;
      background: var(--color-bg, #fff);
      /* Break out of the .container's horizontal padding so the toolbar
         background spans the full viewport width edge-to-edge. The
         padding is then re-added inside the toolbar so the buttons stay
         visually inset from the screen edges. Without this, you can see
         the dark page background peeking past the toolbar's left and
         right edges where the container padding sits. */
      width: auto;
      margin: 0 calc(-1 * var(--space-5)) var(--space-3);
      padding: var(--space-2) var(--space-5) var(--space-3);
      border-bottom: 1px solid var(--color-border);
      box-shadow: 0 2px 8px rgba(15, 10, 25, 0.06);
    }

    /* Drop the visual group separators on mobile - we're tight on width,
       and the 7+5 row split already implies natural grouping. */
    .toolbar-group {
      padding-right: 0;
      margin-right: 0;
      border-right: none;
    }

    /* Force group 5 (Settings/Export/Collect/Share/Save) onto its own
       row. Groups 1-4 total 7 buttons and fit on row 1 at 375px wide. */
    .toolbar-group:nth-child(5) {
      flex-basis: 100%;
    }

    /* Toolbar dropdowns become bottom sheets on mobile. Without this,
       they anchor to narrow 40px buttons and can extend off the left or
       right edge of the viewport where they're unreachable. Pinning to
       the viewport bottom sidesteps all the positioning math and gives
       a thumb-friendly panel. */
    .scope-dropdown,
    .filter-dropdown,
    .export-dropdown {
      position: fixed;
      top: auto;
      bottom: 0;
      left: 0;
      right: 0;
      width: auto;
      max-width: none;
      min-width: 0;
      transform: none;
      margin: 0;
      border-radius: var(--radius-md) var(--radius-md) 0 0;
      border-bottom: none;
      max-height: 70vh;
      overflow-y: auto;
      box-shadow: 0 -8px 24px rgba(15, 10, 25, 0.2);
      z-index: 200;
    }
  }
</style>
