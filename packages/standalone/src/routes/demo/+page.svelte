<script lang="ts">
  import { PaywallError } from "$lib/storage";
  import { demoStorage } from "$lib/storage/demo";
  import CalendarGrid from "$lib/components/scheduler/CalendarGrid.svelte";
  import Sidebar from "$lib/components/scheduler/Sidebar.svelte";
  import DayEditor from "$lib/components/scheduler/DayEditor.svelte";
  import DefaultsModal from "$lib/components/scheduler/DefaultsModal.svelte";
  import CastEditorModal from "$lib/components/scheduler/CastEditorModal.svelte";
  import DateEditorModal from "$lib/components/scheduler/DateEditorModal.svelte";
  import ExportModal from "$lib/components/scheduler/ExportModal.svelte";
  import ShowEditorModal from "$lib/components/scheduler/ShowEditorModal.svelte";
  import Toast from "$lib/components/scheduler/Toast.svelte";
  import type {
    Call,
    CastDisplayMode,
    CastMember,
    Conflict,
    EventType,
    Group,
    IsoDate,
    ScheduleDay,
    ScheduleDoc,
    Settings,
    Show,
  } from "@rehearsal-block/core";
  import { getDefaultCallTimes, downloadCsv, openPrintWindow, weekStartOf } from "@rehearsal-block/core";
  import { publishSchedule, buildShareUrlFromId } from "$lib/share";

  let { data } = $props();

  // Deep-clone so mutations during editing don't touch the server-provided
  // sampleShow singleton. `structuredClone` is enough - ScheduleDoc is pure
  // JSON. The initial-value-only reference is intentional: demo state is
  // seeded once from the load, then owned locally.
  // svelte-ignore state_referenced_locally
  let doc = $state<ScheduleDoc>(structuredClone(data.show));

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
  let paywallOpen = $state(false);
  let defaultsOpen = $state(false);
  let castEditorOpen = $state(false);
  let showEditorOpen = $state(false);
  let dateEditorOpen = $state(false);
  let exportOpen = $state(false);
  let shareId = $state<string | null>(null);
  let shareDropdownOpen = $state(false);
  let publishing = $state(false);
  let lastPublishedJson = $state("");
  const hasUnpublishedChanges = $derived(
    shareId ? JSON.stringify(doc) !== lastPublishedJson : false,
  );
  let exportDropdownOpen = $state(false);
  let csvPickerOpen = $state(false);
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
  /** When pasting onto a day that already has content, this state drives
   *  the Replace/Merge/Cancel modal. */
  let pasteConflict = $state<{
    targetDate: IsoDate;
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

  /**
   * Seed a blank ScheduleDay for days the user hasn't touched yet. Uses
   * the show's per-weekday time defaults: enabled weekdays get a pre-
   * filled call at the configured times; disabled weekdays start with
   * zero calls so the director has to add one manually (matches the
   * "dark until you set a time" UX hint in the Defaults modal).
   */
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
    return {
      eventTypeId: doc.eventTypes[0]?.id ?? "",
      calls,
      description: "",
      notes: "",
      location: doc.settings.defaultLocation ?? "",
    };
  }

  function selectDay(iso: IsoDate) {
    if (doc.schedule[iso]) {
      // Existing day - no draft needed.
      draftDay = null;
    } else {
      // Blank cell - seed a local draft that lives outside doc.schedule
      // until the user actually edits something.
      draftDay = emptyDay(iso);
    }
    selectedDate = iso;
  }

  function closeEditor() {
    selectedDate = null;
    // Discard any uncommitted draft when the editor closes.
    draftDay = null;
  }

  /** Open the confirmation modal asking the user to clear the current day. */
  function requestClearDay() {
    if (!selectedDate) return;
    clearConfirmOpen = true;
  }

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
    if (!selectedDate) return;
    const iso = selectedDate;
    const existing = doc.schedule[iso];
    if (!existing) {
      // Blank-cell draft - discard and close.
      draftDay = null;
      selectedDate = null;
      clearConfirmOpen = false;
      return;
    }
    pushUndoImmediate();
    if (isInDefaults(iso)) {
      doc.schedule[iso] = {
        eventTypeId: existing.eventTypeId,
        calls: [],
        description: "",
        notes: "",
        location: "",
      };
    } else {
      const next = { ...doc.schedule };
      delete next[iso];
      doc.schedule = next;
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
    if (!selectedDate) return;
    if (defaultsOpen || paywallOpen || clearConfirmOpen || conflictToDelete || pasteConflict || castEditorOpen || showEditorOpen || dateEditorOpen || exportOpen)
      return;
    const path = (e.composedPath?.() ?? [e.target]) as EventTarget[];
    for (const node of path) {
      if (!(node instanceof Element)) continue;
      if (node.classList?.contains("editor")) return;
      const aria = node.getAttribute?.("aria-label");
      if (aria && aria.startsWith("Edit ")) return; // day cells + edit ✎ buttons
      if (node.classList?.contains("backdrop")) return; // mobile editor backdrop
    }
    closeEditor();
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
      // Only intercept when a day is selected and the user isn't typing.
      if (selectedDate && !isEditingText()) {
        if (e.key === "c") {
          e.preventDefault();
          copyDay();
          return;
        }
        if (e.key === "x") {
          e.preventDefault();
          cutDay();
          return;
        }
        if (e.key === "v") {
          e.preventDefault();
          pasteDay();
          return;
        }
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
      if (paywallOpen) {
        closePaywall();
        return;
      }
      if (defaultsOpen) {
        defaultsOpen = false;
        return;
      }
      if (selectedDate) {
        closeEditor();
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
      if (paywallOpen || defaultsOpen || clearConfirmOpen || conflictToDelete)
        return;
      if (!selectedDate) return;
      e.preventDefault();
      requestClearDay();
      return;
    }

    // . = collapse all calls, , = expand all calls.
    // Only when the editor is open and the user isn't typing in a field.
    if (e.key === "." || e.key === ",") {
      if (isEditingText()) return;
      if (!selectedDate) return;
      if (paywallOpen || defaultsOpen || clearConfirmOpen || conflictToDelete)
        return;
      e.preventDefault();
      editorAllCollapsed = e.key === ".";
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

  function addEventType(type: EventType) {
    pushUndoImmediate();
    doc.eventTypes = [...doc.eventTypes, type];
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
      existing = emptyDay(iso);
      doc.schedule[iso] = existing;
    }
    if (existing.calls.length === 0) {
      // Weekday was "dark" in defaults, so emptyDay gave us zero calls.
      // Seed a minimal call now so the dropped actor has a home.
      const weekday = getDefaultCallTimes(doc.settings, iso);
      const newCall: Call = {
        id: `call_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        label: "",
        time: weekday?.startTime ?? "19:00",
        endTime: weekday?.endTime ?? "21:30",
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

  function dropActorOnDate(iso: IsoDate, actorId: string, callId?: string) {
    pushUndoImmediate();
    const resolved = resolveDropTarget(iso, callId);
    if (!resolved) return;
    const { day, callIndex } = resolved;
    const target = day.calls[callIndex]!;
    if (target.calledActorIds.includes(actorId)) return;
    patchCallAtIndex(iso, day, callIndex, {
      calledActorIds: [...target.calledActorIds, actorId],
    });
  }

  function dropGroupOnDate(iso: IsoDate, groupId: string, callId?: string) {
    pushUndoImmediate();
    const resolved = resolveDropTarget(iso, callId);
    if (!resolved) return;
    const { day, callIndex } = resolved;
    const target = day.calls[callIndex]!;
    if (target.calledGroupIds.includes(groupId)) return;
    patchCallAtIndex(iso, day, callIndex, {
      calledGroupIds: [...target.calledGroupIds, groupId],
    });
  }

  function dropAllCalledOnDate(iso: IsoDate, callId?: string) {
    pushUndoImmediate();
    const resolved = resolveDropTarget(iso, callId);
    if (!resolved) return;
    const { day, callIndex } = resolved;
    const target = day.calls[callIndex]!;
    if (target.allCalled) return;
    patchCallAtIndex(iso, day, callIndex, { allCalled: true });
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
    if (!selectedDate) {
      showToast("Select a day first");
      return;
    }
    if (selectedDate === clipboard.sourceDate && !clipboard.isCut) {
      showToast("Can't paste onto the same day");
      return;
    }
    const targetDay = doc.schedule[selectedDate];
    if (targetDay && targetDay.calls.length > 0) {
      // Target has content - ask Replace/Merge/Cancel
      pasteConflict = {
        targetDate: selectedDate,
        day: clipboard.day,
        isCut: clipboard.isCut,
        sourceDate: clipboard.sourceDate,
      };
      return;
    }
    // Target is blank or has only a skeleton - just paste
    executePaste("replace");
  }

  function executePaste(mode: "replace" | "merge") {
    if (!clipboard || !selectedDate) return;
    pushUndoImmediate();
    const targetDate = pasteConflict?.targetDate ?? selectedDate;
    const source = clipboard.day;

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

    // If cut, clear the source
    if (clipboard.isCut) {
      const src = clipboard.sourceDate;
      if (doc.schedule[src]) {
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

    showToast(
      clipboard.isCut
        ? `Moved to ${formatDateShort(targetDate)}`
        : `Pasted onto ${formatDateShort(targetDate)}`,
    );
    clipboard = null;
    pasteConflict = null;
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
   * Stub for the "edit show metadata" entry points (name, dates, cast).
   * In demo mode every one of these opens the paywall; the real app will
   * wire them to dedicated editors.
   */
  function tryToEdit() {
    paywallOpen = true;
  }

  async function tryToSave() {
    try {
      await demoStorage.saveShow({
        id: "demo",
        name: doc.show.name,
        updatedAt: new Date().toISOString(),
        document: doc,
      });
    } catch (err) {
      if (err instanceof PaywallError) {
        paywallOpen = true;
      } else {
        throw err;
      }
    }
  }

  function closePaywall() {
    paywallOpen = false;
  }

  function conflictDisplayLabel(c: Conflict): string {
    const actor = doc.cast.find((m) => m.id === c.actorId);
    const name = actor
      ? `${actor.firstName} ${actor.lastName}`
      : "Unknown actor";
    const when =
      c.startTime && c.endTime
        ? `${c.startTime}–${c.endTime}`
        : "full rehearsal";
    return c.label ? `${name} · ${when} · ${c.label}` : `${name} · ${when}`;
  }

  async function publish() {
    shareDropdownOpen = false;
    publishing = true;
    try {
      shareId = await publishSchedule(doc, shareId);
      lastPublishedJson = JSON.stringify(doc);
      showToast(shareId ? "Schedule published!" : "Schedule published!");
    } catch {
      showToast("Could not publish schedule");
    }
    publishing = false;
  }

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

<svelte:head>
  <title>Demo - Rehearsal Block</title>
  {#if doc.settings.theme === "dark"}
    {@html '<style>body{background:#1e1429 !important}.app-header{background:#362242 !important;color:#e0e0e0 !important;border-bottom:none !important}.app-header .brand-logo{filter:brightness(0) saturate(100%) invert(86%) sepia(5%) saturate(400%) hue-rotate(230deg) brightness(98%) !important}[class*="nav-link"]{color:#e0e0e0 !important}[class*="nav-link"]:hover{color:#4a9490 !important}.app-header [class*="btn-primary"]{background:#38817D !important;color:#e0e0e0 !important}.app-footer{background:#1e1429 !important;color:#e0e0e0 !important}.app-footer a,.app-footer strong,.app-footer span{color:#e0e0e0 !important}</style>'}
  {/if}
</svelte:head>

<svelte:window onclick={onWindowClick} onkeydown={onWindowKey} />

<div class="demo-page" class:page-dark={doc.settings.theme === "dark"}>
  <div
    class="demo-inner container"
    class:theme-dark={doc.settings.theme === "dark"}
    class:size-compact={doc.settings.fontSizeScale === "compact"}
    class:size-large={doc.settings.fontSizeScale === "large"}
    style:--font-main={doc.settings.fontFamily ?? "Inter"}
    style:--font-heading={doc.settings.fontHeading ?? "Playfair Display"}
    style:--font-time={doc.settings.fontTime ?? "Inter"}
    style:--font-notes={doc.settings.fontNotes ?? "Inter"}
  >
    <div class="demo-banner">
      <div class="banner-text">
        <strong>You're in demo mode.</strong> Explore a sample show. Changes stay on this page.
      </div>
      <span class="btn btn-primary disabled-link" title="Coming soon">Buy Rehearsal Block - $50</span>
    </div>

    <header class="show-header">
      <div>
        <div class="show-title-row">
          <h1>{doc.show.name}</h1>
          <button
            type="button"
            class="edit-btn"
            aria-label="Edit show name"
            title="Edit show name"
            onclick={tryToEdit}
          >
            ✎
          </button>
        </div>
        <div class="show-dates-row">
          <p class="show-dates">
            {formatHeaderDate(doc.show.startDate)} - {formatHeaderDate(doc.show.endDate)}
          </p>
          <button
            type="button"
            class="edit-btn"
            aria-label="Edit show dates"
            title="Edit show dates"
            onclick={tryToEdit}
          >
            ✎
          </button>
        </div>
      </div>
      <div class="show-actions">
        <div class="undo-redo">
          <button
            type="button"
            class="icon-btn"
            disabled={!canUndo}
            title="Undo (Ctrl+Z)"
            aria-label="Undo"
            onclick={undo}
          >
            ↩
          </button>
          <button
            type="button"
            class="icon-btn"
            disabled={!canRedo}
            title="Redo (Ctrl+Y)"
            aria-label="Redo"
            onclick={redo}
          >
            ↪
          </button>
        </div>
        <button
          type="button"
          class="btn btn-secondary"
          onclick={() => (defaultsOpen = true)}
        >
          <span class="gear" aria-hidden="true">⚙</span> Defaults
        </button>
        <button type="button" class="btn btn-primary" onclick={tryToSave}>Save</button>
        <div class="export-dropdown-wrap">
          <button
            type="button"
            class="btn btn-secondary"
            onclick={(e) => {
              e.stopPropagation();
              exportDropdownOpen = !exportDropdownOpen;
              shareDropdownOpen = false;
            }}
          >
            Export ▾
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
                  printPickerOpen = true;
                }}
              >
                <strong>Print</strong>
                <span>Send to printer</span>
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
            </div>
          {/if}
        </div>
        <div class="export-dropdown-wrap">
          <button
            type="button"
            class="btn btn-secondary"
            class:share-has-changes={hasUnpublishedChanges}
            onclick={(e) => {
              e.stopPropagation();
              shareDropdownOpen = !shareDropdownOpen;
              exportDropdownOpen = false;
            }}
          >
            Share{hasUnpublishedChanges ? " *" : ""} ▾
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
                onclick={copyShareLink}
                disabled={!shareId}
              >
                <strong>Copy Link</strong>
                <span>{shareId ? "Copy the share URL to clipboard" : "Publish first to get a link"}</span>
              </button>
            </div>
          {/if}
        </div>
      </div>
    </header>

    <div
      class="scheduler"
      class:editor-open={!!(selectedDate && selectedDay)}
    >
      <div class="scheduler-sidebar">
        <Sidebar
          show={doc}
          oneditcast={() => (castEditorOpen = true)}
          onsetcastdisplaymode={setCastDisplayMode}
          onaddgroup={addGroup}
          onaddgroupblocked={tryToEdit}
          onupdategroup={updateGroup}
          onremovegroup={removeGroup}
        />
      </div>
      <div class="scheduler-grid">
        <CalendarGrid
          show={doc}
          {selectedDate}
          onselectday={selectDay}
          onremoveactor={removeActorFromCall}
          onremovegroup={removeGroupFromCall}
          onremoveallcalled={removeAllCalledFromCall}
          ondropactor={dropActorOnDate}
          ondropgroup={dropGroupOnDate}
          ondropallcalled={dropAllCalledOnDate}
        />
      </div>
      {#if selectedDate && selectedDay}
        <DayEditor
          date={selectedDate}
          day={selectedDay}
          show={doc}
          onchange={updateSelectedDay}
          onaddlocationpreset={addLocationPreset}
          onaddconflict={addConflict}
          onrequestremoveconflict={requestRemoveConflict}
          onrequestclear={requestClearDay}
          onaddeventtype={addEventType}
          oncopy={copyDayFromEditor}
          onmove={moveDayFromEditor}
          onpaste={pasteDay}
          hasClipboard={!!clipboard}
          allCollapsed={editorAllCollapsed}
          onclose={closeEditor}
        />
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
    onassigneventtype={assignEventTypeToDate}
    onclose={() => (defaultsOpen = false)}
  />
{/if}

{#if exportOpen}
  <ExportModal show={doc} onclose={() => (exportOpen = false)} />
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
          onclick={() => {
            csvPickerOpen = false;
            downloadCsv(doc, {
              mode: "list",
              startDate: doc.show.startDate,
              endDate: doc.show.endDate,
              csvFormat: "gcal",
            });
          }}
        >
          <strong>Google Calendar</strong>
          <span>Formatted for Google Calendar import</span>
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
      <h2>Clear this day?</h2>
      <p>
        All calls, description, notes, location, and called cast will be
        removed from this day.
      </p>
      <div class="modal-actions">
        <button type="button" class="btn btn-secondary" onclick={cancelClearDay}>
          Cancel
        </button>
        <button type="button" class="btn btn-danger" onclick={performClearDay}>
          Clear day
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
      <h2>{clipboard?.isCut ? "Move" : "Paste"} onto {formatDateShort(pasteConflict.targetDate)}?</h2>
      <p>
        This day already has content. How do you want to handle it?
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

{#if paywallOpen}
  <div
    class="modal-backdrop"
    role="button"
    tabindex="0"
    onclick={closePaywall}
    onkeydown={(e) => e.key === "Escape" && closePaywall()}
  >
    <div
      class="modal"
      role="dialog"
      aria-modal="true"
      tabindex="-1"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => e.stopPropagation()}
    >
      <h2>Buy Rehearsal Block to continue</h2>
      <p>
        This feature requires a paid account. Saving, exporting, editing show
        details, managing groups, and more are all included. Rehearsal Block is
        a one-time $50 purchase - no subscription, no recurring fees, unlimited
        shows forever.
      </p>
      <div class="modal-actions">
        <button type="button" class="btn btn-secondary" onclick={closePaywall}>
          Keep exploring
        </button>
        <span class="btn btn-primary disabled-link" title="Coming soon">Buy Rehearsal Block</span>
      </div>
    </div>
  </div>
{/if}

<style>
  .disabled-link {
    opacity: 0.45;
    cursor: not-allowed;
    pointer-events: none;
    user-select: none;
  }

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

  .show-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-4);
    margin-bottom: var(--space-5);
  }

  .show-header h1 {
    margin: 0;
    font-family: var(--font-heading, var(--font-display));
  }

  .show-title-row,
  .show-dates-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .show-title-row {
    margin-bottom: var(--space-1);
  }

  .show-dates {
    color: var(--color-text-muted);
    font-size: 1rem;
    margin: 0;
  }

  .edit-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
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

  .show-actions {
    display: flex;
    gap: var(--space-2);
  }

  .undo-redo {
    display: flex;
    gap: 2px;
    margin-right: var(--space-2);
  }

  .icon-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
    padding: 0;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: var(--color-surface);
    color: var(--color-text);
    font-size: 1rem;
    cursor: pointer;
    transition:
      background var(--transition-fast),
      color var(--transition-fast),
      border-color var(--transition-fast);
  }
  .icon-btn:hover:not(:disabled) {
    background: var(--color-bg-alt);
    border-color: var(--color-plum);
    color: var(--color-plum);
  }
  .icon-btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  .export-dropdown-wrap {
    position: relative;
  }

  .share-has-changes {
    border-color: var(--color-teal) !important;
    color: var(--color-teal) !important;
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

  .gear {
    display: inline-block;
    margin-right: 2px;
  }

  .scheduler {
    display: grid;
    grid-template-columns: 240px minmax(0, 1fr);
    gap: var(--space-5);
    align-items: start;
    transition: grid-template-columns 180ms ease;
  }

  .scheduler.editor-open {
    grid-template-columns: 240px minmax(0, 1fr) minmax(360px, 440px);
  }

  .scheduler-sidebar {
    position: sticky;
    top: var(--space-4);
    max-height: calc(100vh - var(--space-6));
    overflow-y: auto;
    padding-right: var(--space-2);
  }

  .scheduler-grid {
    min-width: 0;
  }

  /* ---- Font settings ---- */
  .demo-inner {
    font-family: var(--font-main), system-ui, sans-serif;
  }

  .demo-inner :global(.month-header h3) {
    font-family: var(--font-heading), Georgia, serif;
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
  .demo-inner.theme-dark :global(.show-header h1) {
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
  .demo-inner.theme-dark :global(.icon-btn) {
    background: #362848;
    border-color: #4a3860;
    color: #e8e4ed;
  }
  .demo-inner.theme-dark :global(.loc-pill) {
    opacity: 0.85;
  }
  .demo-inner.theme-dark :global(.month-header h3) {
    color: #d0c8d8;
  }
  .demo-inner.theme-dark :global(.edit-btn) {
    border-color: #4a3860;
    color: #a8a0b4;
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
    .demo-banner,
    .show-header {
      flex-direction: column;
      align-items: stretch;
    }
  }
</style>
