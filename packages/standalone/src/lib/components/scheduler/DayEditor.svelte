<script lang="ts">
  /**
   * Slide-in day editor. Edits a single ScheduleDay:
   * - event type at the top,
   * - day-level default description + location (inherited by blank calls),
   * - one expandable block per Call with its own time, description,
   *   location, and actor checklist,
   * - a day-wide notes textarea at the bottom.
   *
   * Multi-call support: a director can split a rehearsal into parallel or
   * sequential calls ("7–8 Fight Choreo on Main Stage + 7–9:30 Dance in
   * Rehearsal Hall"). When an actor is called in two blocks on the same
   * day, every row they appear in shows a double-booking warning so the
   * director notices the conflict.
   *
   * Dress/Perf call blocks (crew call, actor call) reuse the same UI - a
   * later phase adds the 2.5-hour-before-curtain time filter on top.
   *
   * The editor is controlled: it receives `day` as a prop and emits
   * patches via `onchange`. The parent owns state.
   */
  import type {
    Call,
    Conflict,
    EventType,
    IsoDate,
    ScheduleDay,
    ScheduleDoc,
  } from "@rehearsal-block/core";
  import {
    EVENT_TYPE_COLOR_PALETTE,
    blockingConflictsFor,
    effectiveDescription,
    formatTime,
    getDefaultCallTimes,
    locationColor,
    overlappingCallsByActor,
  } from "@rehearsal-block/core";
  import LocationChips from "./LocationChips.svelte";
  import RichTextEditor from "./RichTextEditor.svelte";
  import TimePicker from "./TimePicker.svelte";

  interface Props {
    date: IsoDate;
    day: ScheduleDay;
    show: ScheduleDoc;
    onchange: (patch: Partial<ScheduleDay>) => void;
    onaddlocationpreset: (name: string) => void;
    onaddconflict: (conflict: Conflict) => void;
    onrequestremoveconflict: (id: string) => void;
    /** Replace a conflict without confirmation (used by inline edit). */
    onreplaceconflict?: (oldId: string, newConflict: Conflict) => void;
    onrequestclear: () => void;
    /**
     * Add a new event type to the show's `eventTypes` list. Same
     * callback shape as the Defaults modal uses, so a type created
     * from the day editor's pill row also appears in Defaults and on
     * every other day's editor automatically.
     */
    onaddeventtype: (type: EventType) => void;
    oncopy: () => void;
    onmove: () => void;
    onpaste: () => void;
    /** True when the clipboard has content, so the editor can show a paste button. */
    hasClipboard?: boolean;
    onclose: () => void;
    /**
     * When true, collapse all call cards. When false, expand them.
     * Toggled by the parent via . and , hotkeys. The editor reacts
     * to changes via $effect.
     */
    allCollapsed?: boolean;
  }

  const {
    date,
    day,
    show,
    onchange,
    onaddlocationpreset,
    onaddconflict,
    onrequestremoveconflict,
    onreplaceconflict,
    onrequestclear,
    onaddeventtype,
    oncopy,
    onmove,
    onpaste,
    hasClipboard = false,
    onclose,
    allCollapsed,
  }: Props = $props();

  // React to the parent toggling allCollapsed via hotkeys.
  $effect(() => {
    if (allCollapsed === true) collapseAllCalls();
    else if (allCollapsed === false) expandAllCalls();
  });

  // Inline "create event type" form state (triggered by the + pill).
  let newTypeFormOpen = $state(false);
  let newTypeName = $state("");
  let newTypeColorIndex = $state(0);
  let newTypeInputEl = $state<HTMLInputElement | null>(null);

  function openNewTypeForm() {
    newTypeFormOpen = true;
    newTypeName = "";
    newTypeColorIndex = 0;
    queueMicrotask(() => newTypeInputEl?.focus());
  }

  function cancelNewTypeForm() {
    newTypeFormOpen = false;
    newTypeName = "";
  }

  function commitNewType() {
    const name = newTypeName.trim();
    if (!name) return;
    const pair =
      EVENT_TYPE_COLOR_PALETTE[newTypeColorIndex] ??
      EVENT_TYPE_COLOR_PALETTE[0]!;
    const id = `et_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    onaddeventtype({
      id,
      name,
      bgColor: pair.bgColor,
      textColor: pair.textColor,
      isDressPerf: false,
    });
    // Auto-select the newly created type for the day being edited.
    onchange({ eventTypeId: id });
    newTypeFormOpen = false;
    newTypeName = "";
  }

  function onNewTypeKey(e: KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      commitNewType();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancelNewTypeForm();
    }
  }

  // Conflicts that apply to this date, ordered by actor then start time.
  const dayConflicts = $derived<Conflict[]>(
    show.conflicts
      .filter((c) => c.date === date)
      .sort((a, b) => {
        const an = show.cast.find((m) => m.id === a.actorId)?.firstName ?? "";
        const bn = show.cast.find((m) => m.id === b.actorId)?.firstName ?? "";
        return an.localeCompare(bn) || (a.startTime ?? "").localeCompare(b.startTime ?? "");
      }),
  );

  // Call card collapse state. A Set of call ids that are collapsed.
  let collapsedCalls = $state<Set<string>>(new Set());

  function toggleCallCollapsed(callId: string) {
    const next = new Set(collapsedCalls);
    if (next.has(callId)) next.delete(callId);
    else next.add(callId);
    collapsedCalls = next;
  }

  function collapseAllCalls() {
    collapsedCalls = new Set(day.calls.map((c) => c.id));
  }

  function expandAllCalls() {
    collapsedCalls = new Set();
  }

  // Ref for scrolling to the last call card after + Add Call.
  let callCardsContainer = $state<HTMLDivElement | null>(null);

  // Inline "add conflict" form state.
  let conflictFormOpen = $state(false);
  let conflictFormEl = $state<HTMLDivElement | null>(null);
  let newActorId = $state<string>("");
  let newKind = $state<"all-day" | "timed">("all-day");
  let newStart = $state("");
  let newEnd = $state("");
  let newLabel = $state("");

  // Editing existing conflict
  let editingConflictId = $state<string | null>(null);
  let editKind = $state<"all-day" | "timed">("all-day");
  let editStart = $state("");
  let editEnd = $state("");
  let editLabel = $state("");

  function startEditConflict(c: Conflict) {
    editingConflictId = c.id;
    editKind = c.startTime ? "timed" : "all-day";
    editStart = c.startTime ?? "";
    editEnd = c.endTime ?? "";
    editLabel = c.label ?? "";
  }

  function cancelEditConflict() {
    editingConflictId = null;
  }

  function saveEditConflict() {
    if (!editingConflictId) return;
    const old = dayConflicts.find((c) => c.id === editingConflictId);
    if (!old) return;
    const updated: Conflict = {
      id: `conf_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      actorId: old.actorId,
      date,
      label: editLabel.trim(),
      ...(editKind === "timed" && editStart && editEnd
        ? { startTime: editStart, endTime: editEnd }
        : {}),
    };
    if (onreplaceconflict) {
      onreplaceconflict(editingConflictId, updated);
    } else {
      // Fallback: remove + add (may trigger confirmation)
      onrequestremoveconflict(editingConflictId);
      onaddconflict(updated);
    }
    editingConflictId = null;
  }

  function openConflictForm() {
    conflictFormOpen = true;
    newActorId = show.cast[0]?.id ?? "";
    newKind = "all-day";
    newStart = "";
    newEnd = "";
    newLabel = "";
    // The conflicts section can live far below the fold on days with
    // many call cards. Scroll the newly-rendered form into view so the
    // user sees it instead of assuming the button did nothing. Use
    // instant scroll (not smooth) so subsequent clicks land on stable
    // coordinates - smooth scroll animation can cause touch/mouse clicks
    // to miss the form while it's still animating into place.
    queueMicrotask(() => {
      conflictFormEl?.scrollIntoView({ block: "center", behavior: "auto" });
    });
  }

  function cancelConflictForm() {
    conflictFormOpen = false;
  }

  function submitConflictForm() {
    if (!newActorId) return;
    const c: Conflict = {
      id: `conf_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      actorId: newActorId,
      date,
      label: newLabel.trim(),
      ...(newKind === "timed" && newStart && newEnd
        ? { startTime: newStart, endTime: newEnd }
        : {}),
    };
    onaddconflict(c);
    conflictFormOpen = false;
  }

  function actorNameById(id: string): string {
    const m = show.cast.find((x) => x.id === id);
    return m ? `${m.firstName} ${m.lastName}` : "Unknown";
  }

  function conflictRangeLabel(c: Conflict): string {
    if (c.startTime && c.endTime) {
      return `${fmtTime(c.startTime)} – ${fmtTime(c.endTime)}`;
    }
    return "Full rehearsal";
  }

  const eventType = $derived(
    show.eventTypes.find((t) => t.id === day.eventTypeId),
  );

  /**
   * For dress/perf days with a curtain time set, compute the earliest
   * call time based on the configurable window (e.g. 2.5 hours before
   * curtain). Returns "HH:MM" or undefined if not applicable.
   */
  const dpCallMinTime = $derived.by<string | undefined>(() => {
    if (!eventType?.isDressPerf) return undefined;
    const ct = day.curtainTime;
    if (!ct) return undefined;
    const [h, m] = ct.split(":").map(Number);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return undefined;
    const curtainMins = (h as number) * 60 + (m as number);
    const window = show.settings.dressCallWindowMinutes ?? 150;
    const floor = Math.max(0, curtainMins - window);
    const fh = Math.floor(floor / 60);
    const fm = floor % 60;
    return `${String(fh).padStart(2, "0")}:${String(fm).padStart(2, "0")}`;
  });

  /** Max time for dress/perf calls = the curtain time itself. */
  const dpCallMaxTime = $derived<string | undefined>(
    eventType?.isDressPerf && day.curtainTime ? day.curtainTime : undefined,
  );

  /**
   * For each actor: per call index they're in, the indexes of OTHER calls
   * whose times actually overlap. Sequential calls (7–8 then 8–9:30) are
   * not flagged; only true time conflicts are. Passing `show.cast` so the
   * helper can expand `allCalled` to the full cast list for overlap
   * detection - without it, All Called overlaps would silently miss.
   */
  const overlapByActor = $derived(
    overlappingCallsByActor(day, show.groups, show.cast),
  );

  /**
   * Normal click: set as primary type.
   * Ctrl/Cmd+click: toggle as a secondary type (visual badge only).
   * A type can't be both primary and secondary at the same time.
   */
  function setEventType(id: string, ctrlKey: boolean) {
    if (ctrlKey) {
      // Toggle secondary
      if (id === day.eventTypeId) return; // can't demote primary to secondary
      const current = day.secondaryTypeIds ?? [];
      const next = current.includes(id)
        ? current.filter((t) => t !== id)
        : [...current, id];
      onchange({ secondaryTypeIds: next.length > 0 ? next : undefined });
      return;
    }

    // Normal click: if clicking the active primary, clear it
    if (id === day.eventTypeId) {
      onchange({ eventTypeId: "" });
      return;
    }
    // Set as primary
    const newType = show.eventTypes.find((t) => t.id === id);
    const wasDP = eventType?.isDressPerf ?? false;
    const isDP = newType?.isDressPerf ?? false;

    // Remove from secondaries if it was there
    const cleanedSecondaries = (day.secondaryTypeIds ?? []).filter(
      (t) => t !== id,
    );

    // Switching INTO dress/perf mode: seed Crew + Actor calls if the day
    // doesn't already have labeled calls.
    if (isDP && !wasDP) {
      const hasLabeledCalls = day.calls.some((c) => c.label.trim() !== "");
      if (!hasLabeledCalls) {
        onchange({
          eventTypeId: id,
          secondaryTypeIds: cleanedSecondaries.length > 0 ? cleanedSecondaries : undefined,
          calls: [
            {
              id: genCallId(),
              label: "Crew",
              time: "",
              calledActorIds: [],
              calledGroupIds: [],
            },
            {
              id: genCallId(),
              label: "Actor",
              time: "",
              calledActorIds: [],
              calledGroupIds: [],
            },
          ],
        });
        return;
      }
    }

    onchange({
      eventTypeId: id,
      secondaryTypeIds: cleanedSecondaries.length > 0 ? cleanedSecondaries : undefined,
    });
  }

  function genCallId(): string {
    return `call_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function patchCall(index: number, patch: Partial<Call>) {
    const current = day.calls[index];
    if (!current) return;
    const next = day.calls.map((c, i) =>
      i === index ? { ...c, ...patch } : c,
    );
    onchange({ calls: next });
  }

  function addCall() {
    const isDressPerf = eventType?.isDressPerf ?? false;
    let newId: string;
    if (isDressPerf) {
      newId = genCallId();
      const next: Call = {
        id: newId,
        label: "",
        time: "",
        calledActorIds: [],
        calledGroupIds: [],
      };
      onchange({ calls: [...day.calls, next] });
    } else {
      newId = genCallId();
      const last = day.calls[day.calls.length - 1];
      const weekday = getDefaultCallTimes(show.settings, date);
      const next: Call = {
        id: newId,
        label: "",
        time: last?.time ?? weekday?.startTime ?? "19:00",
        endTime: last?.endTime ?? weekday?.endTime ?? "21:30",
        description: "",
        location: "",
        calledActorIds: [],
        calledGroupIds: [],
      };
      onchange({ calls: [...day.calls, next] });
    }
    // Make sure the new card is expanded and scroll it into view.
    const nextCollapsed = new Set(collapsedCalls);
    nextCollapsed.delete(newId);
    collapsedCalls = nextCollapsed;
    queueMicrotask(() => {
      const cards = callCardsContainer?.querySelectorAll(".call-card, .dp-call-card");
      const last = cards?.[cards.length - 1];
      last?.scrollIntoView({ block: "center", behavior: "auto" });
    });
  }

  function removeCall(index: number) {
    if (day.calls.length <= 1) return;
    onchange({ calls: day.calls.filter((_, i) => i !== index) });
  }

  function toggleActor(callIndex: number, actorId: string, called: boolean) {
    const call = day.calls[callIndex];
    if (!call) return;
    const current = call.calledActorIds;
    const nextIds = called
      ? current.includes(actorId)
        ? current
        : [...current, actorId]
      : current.filter((x) => x !== actorId);
    patchCall(callIndex, { calledActorIds: nextIds });
  }

  function toggleGroup(callIndex: number, groupId: string, called: boolean) {
    const call = day.calls[callIndex];
    if (!call) return;
    const current = call.calledGroupIds;
    const nextIds = called
      ? current.includes(groupId)
        ? current
        : [...current, groupId]
      : current.filter((x) => x !== groupId);
    patchCall(callIndex, { calledGroupIds: nextIds });
  }

  function toggleCrew(callIndex: number, crewId: string, called: boolean) {
    const call = day.calls[callIndex];
    if (!call) return;
    const current = call.calledCrewIds ?? [];
    const nextIds = called
      ? current.includes(crewId)
        ? current
        : [...current, crewId]
      : current.filter((x) => x !== crewId);
    patchCall(callIndex, { calledCrewIds: nextIds });
  }

  function toggleAllCalled(callIndex: number, called: boolean) {
    patchCall(callIndex, { allCalled: called || undefined });
  }

  /* Settings-driven label/color for the All Called pseudo-group. Mirrors
     how DayCell, ListView, and the sidebar resolve them so the editor
     stays consistent with the rest of the UI. */
  const allCalledLabel = $derived(
    show.settings.allCalledLabel?.trim() || "All Called",
  );
  const allCalledColor = $derived(show.settings.allCalledColor || "#5b1a2b");

  /* "Who's called" panel mode. Toggled via a Cast/Team button mirroring
     the left sidebar's pattern. Single state shared across all calls in
     this editor session - if the user is in Crew mode and switches calls
     they stay in Crew mode, which is what they likely want. */
  let calledPanelMode = $state<"cast" | "crew">("cast");

  function callAll(callIndex: number) {
    if (calledPanelMode === "cast") {
      patchCall(callIndex, { calledActorIds: show.cast.map((m) => m.id) });
    } else {
      patchCall(callIndex, { calledCrewIds: show.crew.map((m) => m.id) });
    }
  }
  function callNone(callIndex: number) {
    if (calledPanelMode === "cast") {
      patchCall(callIndex, { calledActorIds: [] });
    } else {
      patchCall(callIndex, { calledCrewIds: [] });
    }
  }

  const timeFmt = $derived(show.settings.timeFormat ?? "12h");

  function fmtTime(hhmm: string): string {
    return formatTime(hhmm, timeFmt);
  }

  /**
   * Short label for another call when flagging a double-booking, e.g.
   * "7:00 PM – Fight Choreo" or just "7:00 PM" if no description.
   */
  function otherCallLabel(otherIndex: number): string {
    const c = day.calls[otherIndex];
    if (!c) return "";
    const t = fmtTime(c.time);
    const d = effectiveDescription(day, c).trim();
    return d ? `${t} ${d}` : t;
  }

  function formattedDate(iso: IsoDate): string {
    const [y, m, d] = iso.split("-").map(Number);
    const dt = new Date(Date.UTC(y!, m! - 1, d!));
    return dt.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    });
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- Backdrop is only visible on mobile (<900px), where the editor goes
     full-screen. On desktop the editor sits inline in the page grid and
     needs no backdrop. -->
<div class="backdrop" onclick={onclose}></div>

<div class="editor" role="dialog" aria-label="Edit day">
  <header class="editor-header">
    <div>
      <div class="label">Editing</div>
      <h2>{formattedDate(date)}</h2>
    </div>
    <div class="header-actions">
      <button
        type="button"
        class="header-tool-btn"
        onclick={(e) => { e.stopPropagation(); oncopy(); }}
        title="Copy this day (Ctrl+C)"
      >
        Copy
      </button>
      <button
        type="button"
        class="header-tool-btn"
        onclick={(e) => { e.stopPropagation(); onmove(); }}
        title="Cut this day to move it (Ctrl+X)"
      >
        Move
      </button>
      {#if hasClipboard}
        <button
          type="button"
          class="header-tool-btn paste-btn"
          onclick={(e) => { e.stopPropagation(); onpaste(); }}
          title="Paste clipboard onto this day (Ctrl+V)"
        >
          Paste
        </button>
      {/if}
      <button
        type="button"
        class="clear-day-btn"
        onclick={onrequestclear}
        title="Clear all info from this day (keeps conflicts)"
      >
        Clear
      </button>
      <button type="button" class="close" onclick={onclose} aria-label="Close">
        ×
      </button>
    </div>
  </header>

  <div class="editor-body">
    <section class="field">
      <div class="field-label">Event type</div>
      <div class="pill-row">
        <p class="pill-hint">Click to set primary. Ctrl+click to add secondary.</p>
        {#each show.eventTypes as type (type.id)}
          {@const isPrimary = type.id === day.eventTypeId}
          {@const isSecondary = (day.secondaryTypeIds ?? []).includes(type.id)}
          <button
            type="button"
            class="pill"
            class:active={isPrimary}
            class:secondary={isSecondary}
            style:--pill-bg={type.bgColor}
            style:--pill-fg={type.textColor}
            onclick={(e) => setEventType(type.id, e.ctrlKey || e.metaKey)}
          >
            {type.name}
          </button>
        {/each}
        <button
          type="button"
          class="pill add-type-pill"
          aria-label="Add event type"
          title="Add a new event type"
          onclick={(e) => {
            e.stopPropagation();
            openNewTypeForm();
          }}
        >
          + Add type
        </button>
      </div>
      {#if newTypeFormOpen}
        <div class="new-type-form">
          <input
            bind:this={newTypeInputEl}
            type="text"
            value={newTypeName}
            placeholder="Name (e.g. Fight Call)"
            oninput={(e) => (newTypeName = e.currentTarget.value)}
            onkeydown={onNewTypeKey}
          />
          <div class="new-type-colors">
            {#each EVENT_TYPE_COLOR_PALETTE as pair, i (pair.name)}
              <button
                type="button"
                class="color-swatch"
                class:selected={newTypeColorIndex === i}
                style:background={pair.bgColor}
                style:color={pair.textColor}
                aria-label={`${pair.name} color`}
                title={pair.name}
                onclick={() => (newTypeColorIndex = i)}
              >
                A
              </button>
            {/each}
          </div>
          <div class="new-type-actions">
            <button
              type="button"
              class="link-btn"
              onclick={cancelNewTypeForm}
            >
              Cancel
            </button>
            <button
              type="button"
              class="add-call-btn"
              disabled={!newTypeName.trim()}
              onclick={commitNewType}
            >
              Add type
            </button>
          </div>
        </div>
      {/if}
    </section>

    {#if eventType?.isDressPerf}
      <!-- ============================================================
           DRESS/PERFORMANCE MODE
           Simplified layout: curtain time, location, labeled call-time
           blocks (no end time, no description, no per-call actor
           checklist). Everyone is implicitly called for dress/perf days;
           individual conflicts are still tracked via the shared
           Conflicts section below.
           ============================================================ -->
      <section class="field">
        <div class="field-label">Curtain time</div>
        <TimePicker
          value={day.curtainTime ?? ""}
          minuteStep={show.settings.timeIncrementMinutes ?? 15}
          timeFormat={timeFmt}
          ariaLabel="Curtain time"
          onchange={(next) => onchange({ curtainTime: next })}
        />
      </section>

      <section class="field">
        <div class="field-label">Location</div>
        <LocationChips
          value={day.location}
          presets={show.locationPresets}
          onchange={(next) => onchange({ location: next })}
          onaddpreset={onaddlocationpreset}
        />
      </section>

      <section class="field">
        <div class="field-header">
          <div class="field-label">
            Call times <span class="count">({day.calls.length})</span>
          </div>
          <button type="button" class="add-call-btn" onclick={addCall}>
            + Add Call
          </button>
        </div>

        <div class="calls" bind:this={callCardsContainer}>
          {#each day.calls as call, callIndex (call.id)}
            {@const isCollapsed = collapsedCalls.has(call.id)}
            <div class="call-card dp-call-card" class:collapsed={isCollapsed}>
              <div class="dp-call-row">
                <input
                  type="text"
                  class="dp-label-input"
                  value={call.label}
                  placeholder="Label"
                  oninput={(e) =>
                    patchCall(callIndex, { label: e.currentTarget.value })}
                />
                <input
                  class="dp-call-suffix"
                  type="text"
                  value={call.suffix ?? "Call"}
                  title="Click to edit (default: Call)"
                  spellcheck="false"
                  size={Math.max(3, (call.suffix ?? "Call").length)}
                  oninput={(e) => {
                    const raw = e.currentTarget.value;
                    const text = raw.trim() || "Call";
                    // Prevent Svelte from overwriting cursor by setting value back immediately
                    e.currentTarget.value = raw;
                    patchCall(callIndex, { suffix: text === "Call" ? undefined : text });
                  }}
                  onblur={(e) => {
                    if (!e.currentTarget.value.trim()) e.currentTarget.value = "Call";
                  }}
                  onfocus={(e) => e.currentTarget.select()}
                />
                <TimePicker
                  value={call.time}
                  minuteStep={show.settings.timeIncrementMinutes ?? 15}
                  ariaLabel={`${call.label || "Call " + (callIndex + 1)} time`}
                  timeFormat={timeFmt}
                  minTime={dpCallMinTime}
                  maxTime={dpCallMaxTime}
                  onchange={(next) => patchCall(callIndex, { time: next })}
                />
                {#if day.calls.length > 1}
                  <button
                    type="button"
                    class="remove-call"
                    onclick={() => removeCall(callIndex)}
                    aria-label={`Remove ${call.label || "call " + (callIndex + 1)}`}
                  >
                    Remove
                  </button>
                {/if}
              </div>

              <!-- No actor checklist for dress/perf calls. Directors can
                   still drag group or cast chips from the sidebar onto
                   the grid cell's call blocks to assign them. -->
            </div>
          {/each}
        </div>
      </section>
    {:else}
      <!-- ============================================================
           NORMAL REHEARSAL MODE
           Full layout: day defaults, multi-call blocks with times,
           descriptions, locations, and per-call actor checklists.
           ============================================================ -->
    <section class="field">
      <div class="field-label">Day defaults</div>
      <p class="hint">
        Inherited by calls that leave their description or location blank.
      </p>
      <input
        type="text"
        value={day.description}
        placeholder="Overall description (e.g. Act 1 rehearsal)"
        oninput={(e) => onchange({ description: e.currentTarget.value })}
      />
      <div class="sublabel">Default location</div>
      <LocationChips
        value={day.location}
        presets={show.locationPresets}
        onchange={(next) => onchange({ location: next })}
        onaddpreset={onaddlocationpreset}
      />
    </section>

    <section class="field">
      <div class="field-header">
        <div class="field-label">
          Calls <span class="count">({day.calls.length})</span>
        </div>
        <div class="btn-row">
          {#if day.calls.length > 1}
            <button
              type="button"
              class="link-btn"
              title="Collapse all (.)"
              onclick={collapseAllCalls}
            >
              Collapse
            </button>
            <button
              type="button"
              class="link-btn"
              title="Expand all (,)"
              onclick={expandAllCalls}
            >
              Expand
            </button>
          {/if}
          <button type="button" class="add-call-btn" onclick={addCall}>
            + Add Call
          </button>
        </div>
      </div>

      <div class="calls" bind:this={callCardsContainer}>
        {#each day.calls as call, callIndex (call.id)}
          {@const isCollapsed = collapsedCalls.has(call.id)}
          <div class="call-card" class:collapsed={isCollapsed}>
            <div class="call-card-header">
              <button
                type="button"
                class="collapse-toggle"
                aria-label={isCollapsed ? "Expand call" : "Collapse call"}
                title={isCollapsed ? "Expand" : "Collapse"}
                onclick={() => toggleCallCollapsed(call.id)}
              >
                <span class="collapse-arrow" class:rotated={!isCollapsed}>▸</span>
              </button>
              <span class="call-number">
                <span class="call-word">CALL</span> {callIndex + 1}
              </span>
              {#if isCollapsed}
                <span class="collapsed-summary">
                  {call.time ? fmtTime(call.time) : "no time"}{call.endTime ? ` - ${fmtTime(call.endTime)}` : call.time ? "+" : ""}
                  {#if (call.description ?? "").trim()}
                    · {call.description}
                  {/if}
                </span>
              {/if}
              {#if day.calls.length > 1}
                <button
                  type="button"
                  class="remove-call"
                  onclick={() => removeCall(callIndex)}
                  aria-label={`Remove call ${callIndex + 1}`}
                >
                  Remove
                </button>
              {/if}
            </div>

            {#if !isCollapsed}
            <div class="time-row">
              <div class="time-col">
                <div class="field-label">Start</div>
                <TimePicker
                  value={call.time}
                  minuteStep={show.settings.timeIncrementMinutes ?? 15}
                  ariaLabel={`Call ${callIndex + 1} start time`}
                  timeFormat={timeFmt}
                  clearable
                  onchange={(next) => patchCall(callIndex, { time: next })}
                />
              </div>
              <div class="time-col">
                <div class="field-label">End</div>
                <TimePicker
                  value={call.endTime ?? ""}
                  minuteStep={show.settings.timeIncrementMinutes ?? 15}
                  ariaLabel={`Call ${callIndex + 1} end time`}
                  timeFormat={timeFmt}
                  clearable
                  minTime={call.time || undefined}
                  onchange={(next) => patchCall(callIndex, { endTime: next })}
                />
              </div>
            </div>

            <label for="desc-{call.id}">What are we doing?</label>
            <input
              id="desc-{call.id}"
              type="text"
              value={call.description ?? ""}
              placeholder={day.description || "Fight choreo, dance call, etc."}
              oninput={(e) => patchCall(callIndex, { description: e.currentTarget.value })}
            />

            <div class="sublabel">Location</div>
            <LocationChips
              value={call.location ?? ""}
              presets={show.locationPresets}
              fallback={day.location}
              onchange={(next) => patchCall(callIndex, { location: next })}
              onaddpreset={onaddlocationpreset}
            />

            <div class="called-header">
              <div class="field-label">Who's called</div>
              <div class="btn-row">
                <button
                  type="button"
                  class="called-mode-toggle"
                  aria-label="Toggle between cast and production team"
                  title="Click to switch between cast and production team"
                  onclick={() =>
                    (calledPanelMode = calledPanelMode === "cast" ? "crew" : "cast")}
                >
                  {calledPanelMode === "cast" ? "Cast" : "Team"}
                  <span class="count">
                    ({calledPanelMode === "cast"
                      ? show.cast.length
                      : show.crew.length})
                  </span>
                  <svg
                    class="toggle-arrow"
                    width="11"
                    height="11"
                    viewBox="0 -960 960 960"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <path d="M480-344 240-584l56-56 184 184 184-184 56 56-240 240Z" />
                  </svg>
                </button>
                <button
                  type="button"
                  class="link-btn"
                  onclick={() => callAll(callIndex)}>All</button
                >
                <button
                  type="button"
                  class="link-btn"
                  onclick={() => callNone(callIndex)}>None</button
                >
              </div>
            </div>

            <!-- Groups list - shown in BOTH Cast and Team modes. Even
                 when the user is browsing crew, they may still want to
                 toggle a cast group or All Called for the same call.
                 The All Called row is rendered as a pseudo-group at the
                 top of this list. -->
            <ul class="group-call-list">
              <li>
                <label class="group-row">
                  <input
                    type="checkbox"
                    checked={call.allCalled === true}
                    onchange={(e) =>
                      toggleAllCalled(callIndex, e.currentTarget.checked)}
                  />
                  <span
                    class="swatch swatch-square"
                    style:background={allCalledColor}
                  ></span>
                  <span class="actor-name">{allCalledLabel}</span>
                  <span class="actor-character">
                    {show.cast.length} cast member{show.cast.length === 1 ? "" : "s"}
                  </span>
                </label>
              </li>
              {#each show.groups as group (group.id)}
                {@const checked = call.calledGroupIds.includes(group.id)}
                {@const groupSwatch =
                  group.color ?? locationColor(group.id) ?? "#6a1b9a"}
                <li>
                  <label class="group-row">
                    <input
                      type="checkbox"
                      {checked}
                      onchange={(e) =>
                        toggleGroup(
                          callIndex,
                          group.id,
                          e.currentTarget.checked,
                        )}
                    />
                    <span
                      class="swatch swatch-square"
                      style:background={groupSwatch}
                    ></span>
                    <span class="actor-name">{group.name}</span>
                    <span class="actor-character">
                      {group.memberIds.length} member{group.memberIds.length === 1 ? "" : "s"}
                    </span>
                  </label>
                </li>
              {/each}
            </ul>

            {#if calledPanelMode === "cast"}
              <ul class="actor-list">
                {#each show.cast as member (member.id)}
                  {@const blockers = blockingConflictsFor(
                    member.id,
                    call,
                    dayConflicts,
                  )}
                  {@const isBlocked = blockers.length > 0}
                  {@const checked =
                    !isBlocked && call.calledActorIds.includes(member.id)}
                  {@const otherBookings =
                    overlapByActor.get(member.id)?.get(callIndex) ?? []}
                  <!-- "Effectively called" = directly listed, OR via a group
                       that's called on this call, OR via allCalled. The
                       warning needs this broader notion so dropping a group
                       (Montagues, All Called, ...) still surfaces overlap
                       warnings for the actors inside. The checkbox itself
                       stays bound to direct membership only. -->
                  {@const effectivelyCalled =
                    !isBlocked &&
                    (checked ||
                      call.allCalled === true ||
                      call.calledGroupIds.some((gid) => {
                        const g = show.groups.find((x) => x.id === gid);
                        return g ? g.memberIds.includes(member.id) : false;
                      }))}
                  {@const showWarning =
                    effectivelyCalled && otherBookings.length > 0}
                  <li>
                    <label
                      class="actor-row"
                      class:warn={showWarning}
                      class:blocked={isBlocked}
                    >
                      <input
                        type="checkbox"
                        {checked}
                        disabled={isBlocked}
                        onchange={(e) =>
                          toggleActor(callIndex, member.id, e.currentTarget.checked)}
                      />
                      <span class="swatch" style:background={member.color}></span>
                      <span class="actor-name">
                        {member.firstName} {member.lastName}
                      </span>
                      <span class="actor-character">{member.character}</span>
                    </label>
                    {#if isBlocked}
                      <div class="block-line">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" fill="currentColor" style="width: 1em; height: 1em; vertical-align: middle;"><path d="M324-111.5Q251-143 197-197t-85.5-127Q80-397 80-480t31.5-156Q143-709 197-763t127-85.5Q397-880 480-880t156 31.5Q709-817 763-763t85.5 127Q880-563 880-480t-31.5 156Q817-251 763-197t-127 85.5Q563-80 480-80t-156-31.5ZM480-160q54 0 104-17.5t92-50.5L228-676q-33 42-50.5 92T160-480q0 134 93 227t227 93Zm252-124q33-42 50.5-92T800-480q0-134-93-227t-227-93q-54 0-104 17.5T284-732l448 448ZM480-480Z"/></svg> Unavailable:
                        {blockers
                          .map((b) =>
                            b.startTime && b.endTime
                              ? `${fmtTime(b.startTime)}–${fmtTime(b.endTime)}${b.label ? ` (${b.label})` : ""}`
                              : b.label || "full rehearsal",
                          )
                          .join(", ")}
                      </div>
                    {:else if showWarning}
                      <div class="warn-line">
                        ⚠ Also called in
                        {otherBookings.map(otherCallLabel).join(", ")}
                      </div>
                    {/if}
                  </li>
                {/each}
              </ul>
            {:else}
              <!-- Crew (production team) panel. No groups for crew - they
                   don't have group definitions in the schema. No conflict
                   warnings since the crew schedule doesn't track per-call
                   overlaps yet. -->
              {#if show.crew.length === 0}
                <p class="empty-list-hint">
                  No production team members yet. Add them in Default
                  Settings &gt; Contacts &gt; Production Team.
                </p>
              {:else}
                <ul class="actor-list">
                  {#each show.crew as member (member.id)}
                    {@const checked = (call.calledCrewIds ?? []).includes(member.id)}
                    <li>
                      <label class="actor-row">
                        <input
                          type="checkbox"
                          {checked}
                          onchange={(e) =>
                            toggleCrew(
                              callIndex,
                              member.id,
                              e.currentTarget.checked,
                            )}
                        />
                        <span
                          class="swatch swatch-square"
                          style:background={member.color}
                        ></span>
                        <span class="actor-name">
                          {member.firstName} {member.lastName}
                        </span>
                        <span class="actor-character">{member.role}</span>
                      </label>
                    </li>
                  {/each}
                </ul>
              {/if}
            {/if}
          {/if}
          </div>
        {/each}
      </div>
    </section>
    {/if}

    <!-- ============================================================
         SHARED SECTIONS: Conflicts + Notes (same for both modes)
         ============================================================ -->
    <section class="field">
      <div class="field-header">
        <div class="field-label">
          Conflicts <span class="count">({dayConflicts.length})</span>
        </div>
        {#if !conflictFormOpen}
          <button
            type="button"
            class="add-call-btn add-conflict-btn"
            onclick={(e) => {
              e.stopPropagation();
              openConflictForm();
            }}
          >
            + Add Conflict
          </button>
        {/if}
      </div>

      {#if dayConflicts.length > 0}
        <ul class="conflict-list">
          {#each dayConflicts as c (c.id)}
            <li class="conflict-row">
              {#if editingConflictId === c.id}
                <div class="conflict-edit-form">
                  <strong>{actorNameById(c.actorId)}</strong>
                  <div class="conflict-edit-kind">
                    <label>
                      <input type="radio" value="all-day" bind:group={editKind} /> Full day
                    </label>
                    <label>
                      <input type="radio" value="timed" bind:group={editKind} /> Timed
                    </label>
                  </div>
                  {#if editKind === "timed"}
                    <div class="conflict-edit-times">
                      <TimePicker
                        value={editStart}
                        compact
                        timeFormat={timeFmt}
                        minuteStep={show.settings.timeIncrementMinutes ?? 15}
                        onchange={(v) => (editStart = v)}
                        ariaLabel="Conflict start time"
                      />
                      <span class="conflict-edit-sep">to</span>
                      <TimePicker
                        value={editEnd}
                        compact
                        timeFormat={timeFmt}
                        minuteStep={show.settings.timeIncrementMinutes ?? 15}
                        minTime={editStart}
                        onchange={(v) => (editEnd = v)}
                        ariaLabel="Conflict end time"
                      />
                    </div>
                  {/if}
                  <input
                    type="text"
                    class="conflict-edit-label"
                    value={editLabel}
                    placeholder="Label (optional)"
                    oninput={(e) => (editLabel = e.currentTarget.value)}
                  />
                  <div class="conflict-edit-actions">
                    <button type="button" class="remove-call" onclick={cancelEditConflict}>Cancel</button>
                    <button type="button" class="save-conflict-btn" onclick={saveEditConflict}>Save</button>
                  </div>
                </div>
              {:else}
                <div class="conflict-info">
                  <strong>{actorNameById(c.actorId)}</strong>
                  <span class="conflict-range">{conflictRangeLabel(c)}</span>
                  {#if c.label}
                    <span class="conflict-label">- {c.label}</span>
                  {/if}
                </div>
                <div class="conflict-actions">
                  <button
                    type="button"
                    class="edit-conflict-btn"
                    aria-label={`Edit conflict for ${actorNameById(c.actorId)}`}
                    onclick={() => startEditConflict(c)}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    class="remove-call"
                    aria-label={`Remove conflict for ${actorNameById(c.actorId)}`}
                    onclick={() => onrequestremoveconflict(c.id)}
                  >
                    Remove
                  </button>
                </div>
              {/if}
            </li>
          {/each}
        </ul>
      {:else if !conflictFormOpen}
        <p class="hint">No conflicts recorded for this day.</p>
      {/if}

      {#if conflictFormOpen}
        <div class="conflict-form" bind:this={conflictFormEl}>
          <label for="conflict-actor-{date}">Who?</label>
          <select
            id="conflict-actor-{date}"
            value={newActorId}
            onchange={(e) => (newActorId = e.currentTarget.value)}
          >
            {#each show.cast as m (m.id)}
              <option value={m.id}>{m.firstName} {m.lastName} - {m.character}</option>
            {/each}
          </select>

          <div class="kind-row">
            <label class="kind-option">
              <input
                type="radio"
                name="conflict-kind-{date}"
                value="all-day"
                checked={newKind === "all-day"}
                onchange={() => (newKind = "all-day")}
              />
              Full rehearsal
            </label>
            <label class="kind-option">
              <input
                type="radio"
                name="conflict-kind-{date}"
                value="timed"
                checked={newKind === "timed"}
                onchange={() => (newKind = "timed")}
              />
              Time range
            </label>
          </div>

          {#if newKind === "timed"}
            <div class="time-row">
              <div class="time-col">
                <div class="field-label">Start</div>
                <TimePicker
                  value={newStart}
                  minuteStep={show.settings.timeIncrementMinutes ?? 15}
                  ariaLabel="Conflict start time"
                  timeFormat={timeFmt}
                  onchange={(next) => (newStart = next)}
                />
              </div>
              <div class="time-col">
                <div class="field-label">End</div>
                <TimePicker
                  value={newEnd}
                  minuteStep={show.settings.timeIncrementMinutes ?? 15}
                  ariaLabel="Conflict end time"
                  timeFormat={timeFmt}
                  onchange={(next) => (newEnd = next)}
                />
              </div>
            </div>
          {/if}

          <label for="conflict-label-{date}">Label (optional)</label>
          <input
            id="conflict-label-{date}"
            type="text"
            value={newLabel}
            placeholder="Work, sick, class, etc."
            oninput={(e) => (newLabel = e.currentTarget.value)}
          />

          <div class="form-actions">
            <button type="button" class="link-btn" onclick={cancelConflictForm}>
              Cancel
            </button>
            <button
              type="button"
              class="add-call-btn"
              disabled={!newActorId || (newKind === "timed" && (!newStart || !newEnd))}
              onclick={submitConflictForm}
            >
              Save conflict
            </button>
          </div>
        </div>
      {/if}
    </section>

    <section class="field">
      <div class="field-label">Notes</div>
      <RichTextEditor
        value={day.notes}
        placeholder="Anything the cast should know…"
        oninput={(html) => onchange({ notes: html })}
      />
    </section>

    <div class="done-row">
      <button type="button" class="btn btn-primary done-btn" onclick={onclose}>
        Done
      </button>
    </div>
  </div>
</div>

<style>
  .backdrop {
    /* Desktop: the editor is a normal grid column next to the calendar,
       so no backdrop is needed. Mobile overrides below turn it back on. */
    display: none;
  }

  .editor {
    /* Desktop: sit as a regular child of the scheduler grid. Sticky so
       the panel stays in view as the calendar scrolls underneath. */
    position: sticky;
    top: var(--space-4);
    width: 100%;
    max-height: calc(100vh - 2 * var(--space-4));
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-md);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .editor-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    padding: var(--space-5);
    border-bottom: 1px solid var(--color-border);
    gap: var(--space-3);
  }

  .editor-header .label {
    font-size: 0.6875rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--color-text-subtle);
    font-weight: 700;
    margin-bottom: 2px;
  }

  .editor-header h2 {
    font-family: var(--font-display);
    color: var(--color-plum);
    font-size: 1.125rem;
    margin: 0;
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .header-tool-btn {
    background: transparent;
    border: 1px solid var(--color-border);
    color: var(--color-text-muted);
    font-size: 0.6875rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    padding: var(--space-1) var(--space-2);
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition:
      color var(--transition-fast),
      border-color var(--transition-fast),
      background var(--transition-fast);
  }
  .header-tool-btn:hover {
    color: var(--color-plum);
    border-color: var(--color-plum);
    background: var(--color-bg-alt);
  }

  .paste-btn {
    color: var(--color-teal-dark);
    border-color: var(--color-teal);
  }
  .paste-btn:hover {
    color: var(--color-text-inverse);
    border-color: var(--color-teal);
    background: var(--color-teal);
  }

  .clear-day-btn {
    background: transparent;
    border: 1px solid var(--color-border-strong);
    color: var(--color-text-muted);
    font-size: 0.6875rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    padding: var(--space-1) var(--space-3);
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition:
      color var(--transition-fast),
      border-color var(--transition-fast),
      background var(--transition-fast);
  }
  .clear-day-btn:hover {
    color: var(--color-danger);
    border-color: var(--color-danger);
    background: var(--color-danger-bg);
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

  .editor-body {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-5);
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .done-row {
    display: flex;
    justify-content: flex-end;
    padding-top: var(--space-2);
  }

  .done-btn {
    min-width: 120px;
  }

  .field-label,
  .field label,
  .sublabel {
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--color-text-subtle);
    font-weight: 700;
  }

  .sublabel {
    margin-top: var(--space-1);
  }

  .count {
    color: var(--color-text-subtle);
    font-weight: 500;
  }

  .field-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .field input[type="text"],
  .call-card input[type="text"] {
    font: inherit;
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--color-border-strong);
    border-radius: var(--radius-sm);
    background: var(--color-surface);
    color: var(--color-text);
    width: 100%;
  }

  .field input:focus,
  .call-card input:focus {
    outline: 2px solid var(--color-teal);
    outline-offset: 0;
    border-color: var(--color-teal);
  }

  .pill-row {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }

  /* Pills use each event type's own badge colors so the toolbar matches
     how the same events render in the grid cells. Inactive pills are
     dimmed and the active one gets a ring of its own text color to read
     as selected without swapping palettes. */
  .pill {
    padding: var(--space-2) var(--space-3);
    background: var(--pill-bg);
    color: var(--pill-fg);
    border: 1px solid transparent;
    border-radius: var(--radius-full);
    font: inherit;
    font-size: 0.6875rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    cursor: pointer;
    opacity: 0.55;
    transition:
      opacity var(--transition-fast),
      box-shadow var(--transition-fast),
      border-color var(--transition-fast);
  }
  .pill:hover {
    opacity: 1;
  }
  .pill.active {
    opacity: 1;
    border-color: var(--pill-fg);
    box-shadow:
      0 0 0 2px var(--pill-bg),
      0 0 0 3px var(--pill-fg);
  }

  .pill.secondary {
    opacity: 0.85;
    border-color: var(--pill-fg);
    border-style: dashed;
  }

  .pill-hint {
    width: 100%;
    font-size: 0.625rem;
    color: var(--color-text-subtle);
    margin: 0;
    font-style: italic;
  }

  .add-type-pill {
    background: transparent;
    color: var(--color-text-subtle);
    border: 1px dashed var(--color-border-strong);
    opacity: 1;
    text-transform: none;
    letter-spacing: 0;
    font-weight: 600;
  }
  .add-type-pill:hover {
    border-color: var(--color-plum);
    color: var(--color-plum);
    background: var(--color-bg-alt);
    box-shadow: none;
  }

  .new-type-form {
    margin-top: var(--space-2);
    padding: var(--space-3);
    background: var(--color-bg-alt);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .new-type-form input[type="text"] {
    font: inherit;
    font-size: 0.875rem;
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--color-border-strong);
    border-radius: var(--radius-sm);
    background: var(--color-surface);
    color: var(--color-text);
    width: 100%;
  }
  .new-type-form input[type="text"]:focus {
    outline: 2px solid var(--color-teal);
    outline-offset: 0;
    border-color: var(--color-teal);
  }
  .new-type-colors {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
  }
  .color-swatch {
    width: 24px;
    height: 24px;
    border-radius: var(--radius-sm);
    border: 2px solid transparent;
    font-size: 0.75rem;
    font-weight: 700;
    cursor: pointer;
    padding: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition: transform var(--transition-fast);
  }
  .color-swatch:hover {
    transform: scale(1.1);
  }
  .color-swatch.selected {
    border-color: var(--color-plum);
    box-shadow: 0 0 0 2px var(--color-surface), 0 0 0 3px var(--color-plum);
  }
  .new-type-actions {
    display: flex;
    justify-content: flex-end;
    align-items: center;
    gap: var(--space-3);
    margin-top: var(--space-1);
  }

  .add-call-btn {
    background: var(--color-plum);
    color: var(--color-text-inverse);
    border: none;
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-sm);
    font-size: 0.75rem;
    font-weight: 700;
    cursor: pointer;
  }
  .add-call-btn:hover {
    background: var(--color-plum-light);
  }

  .calls {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .call-card {
    background: var(--color-bg-alt);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    padding: var(--space-3);
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .dp-call-card {
    padding: var(--space-2) var(--space-3);
  }

  .dp-call-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex-wrap: wrap;
  }

  .dp-label-input {
    font: inherit;
    font-size: 0.875rem;
    font-weight: 700;
    padding: var(--space-1) var(--space-2);
    border: 1px dashed var(--color-border-strong);
    border-radius: var(--radius-sm);
    background: var(--color-surface);
    color: var(--color-plum);
    width: 6rem;
  }
  .dp-label-input:focus {
    outline: 2px solid var(--color-teal);
    outline-offset: 0;
    border-style: solid;
    border-color: var(--color-teal);
  }

  .dp-call-suffix {
    font: inherit;
    font-size: 0.875rem;
    font-weight: 700;
    color: var(--color-text-muted);
    flex-shrink: 0;
    border: none;
    border-bottom: 1px dashed transparent;
    background: transparent;
    padding: 0 2px;
    cursor: text;
    outline: none;
    transition: border-color var(--transition-fast), color var(--transition-fast);
    min-width: 2rem;
  }
  .dp-call-suffix:hover {
    border-bottom-color: var(--color-border-strong);
    color: var(--color-text);
  }
  .dp-call-suffix:focus {
    border-bottom-color: var(--color-teal);
    color: var(--color-text);
  }

  .call-card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--space-1);
  }

  .collapse-toggle {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.5rem;
    height: 1.5rem;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--color-text-muted);
    font-size: 1rem;
    cursor: pointer;
    flex-shrink: 0;
    transition: color var(--transition-fast);
  }
  .collapse-toggle:hover {
    color: var(--color-plum);
  }
  .collapse-arrow {
    display: inline-block;
    transition: transform 120ms ease;
  }
  .collapse-arrow.rotated {
    transform: rotate(90deg);
  }

  .collapsed-summary {
    font-size: 0.6875rem;
    color: var(--color-text-muted);
    font-weight: 500;
    margin-left: var(--space-1);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex: 1;
    min-width: 0;
  }

  .call-number {
    color: var(--color-plum);
    font-size: 0.8125rem;
    font-weight: 700;
  }

  .call-word {
    font-size: 0.625rem;
    letter-spacing: 0.08em;
    font-weight: 800;
    vertical-align: 0.5px;
  }

  .remove-call {
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
  .remove-call:hover {
    background: var(--color-danger-bg);
  }

  .time-row {
    display: flex;
    gap: var(--space-3);
  }
  .time-col {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .called-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: var(--space-2);
    gap: var(--space-2);
    flex-wrap: wrap;
  }

  .btn-row {
    display: flex;
    gap: var(--space-2);
    align-items: center;
  }

  /* Cast/Team toggle in the called-header. Mirrors the left sidebar's
     `.sidebar-view-toggle` styling so the two switches feel like the
     same control. */
  .called-mode-toggle {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    font: inherit;
    font-size: 0.6875rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    padding: 4px 10px;
    border: 1px solid var(--color-teal);
    border-radius: var(--radius-full);
    background: var(--color-teal);
    color: var(--color-text-inverse);
    cursor: pointer;
    transition:
      background var(--transition-fast),
      border-color var(--transition-fast);
  }
  .called-mode-toggle:hover {
    background: var(--color-teal-dark);
    border-color: var(--color-teal-dark);
  }
  .called-mode-toggle .count {
    opacity: 0.85;
    font-weight: 600;
  }
  .called-mode-toggle .toggle-arrow {
    margin-left: 2px;
  }

  /* Group selection list inside the called panel. Lighter than the cast
     list and sits directly above it. */
  .group-call-list {
    list-style: none;
    padding: 0;
    margin: 0 0 var(--space-2) 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: var(--color-bg-alt);
  }

  .group-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    cursor: pointer;
    font-size: 0.8125rem;
  }
  .group-row:hover {
    background: var(--color-surface);
  }

  /* Square variant of the swatch dot used for groups (and crew, since
     crew uses square chips elsewhere too). Visually distinguishes
     groups from individual cast circles. */
  .swatch-square {
    border-radius: 2px;
  }

  .empty-list-hint {
    font-size: 0.75rem;
    color: var(--color-text-muted);
    font-style: italic;
    padding: var(--space-3);
    border: 1px dashed var(--color-border);
    border-radius: var(--radius-sm);
    margin: 0;
    text-align: center;
  }

  .link-btn {
    background: none;
    border: none;
    padding: 0;
    color: var(--color-teal-dark);
    font-size: 0.75rem;
    font-weight: 600;
    cursor: pointer;
  }
  .link-btn:hover {
    text-decoration: underline;
  }

  .actor-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    max-height: 260px;
    overflow-y: auto;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: var(--color-surface);
  }

  .actor-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    cursor: pointer;
    font-size: 0.8125rem;
  }
  .actor-row:hover {
    background: var(--color-bg-alt);
  }
  .actor-row.warn {
    background: var(--color-warning-bg);
  }
  .actor-row.blocked {
    background: var(--color-danger-bg);
    opacity: 0.7;
    cursor: not-allowed;
  }
  .actor-row.blocked .actor-name,
  .actor-row.blocked .actor-character {
    text-decoration: line-through;
  }

  .swatch {
    width: 10px;
    height: 10px;
    border-radius: var(--radius-full);
    flex-shrink: 0;
  }

  .actor-name {
    font-weight: 600;
    color: var(--color-text);
  }

  .actor-character {
    color: var(--color-text-muted);
    font-size: 0.6875rem;
    margin-left: auto;
  }

  .warn-line {
    font-size: 0.6875rem;
    color: var(--color-warning);
    padding: 0 var(--space-3) var(--space-2);
    font-weight: 600;
    background: var(--color-warning-bg);
  }

  .block-line {
    font-size: 0.6875rem;
    color: var(--color-danger);
    padding: 0 var(--space-3) var(--space-2);
    font-weight: 600;
    background: var(--color-danger-bg);
  }

  .hint {
    font-size: 0.6875rem;
    color: var(--color-text-muted);
    font-style: italic;
    margin: 0;
  }

  .conflict-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .conflict-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    background: var(--color-warning-bg);
    border: 1px solid var(--color-warning);
    border-radius: var(--radius-sm);
    font-size: 0.8125rem;
  }

  .conflict-info {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    align-items: baseline;
    min-width: 0;
  }

  .conflict-actions {
    display: flex;
    gap: var(--space-1);
    flex-shrink: 0;
  }

  .edit-conflict-btn {
    font: inherit;
    font-size: 0.75rem;
    font-weight: 500;
    padding: 0 var(--space-2);
    border: none;
    background: transparent;
    color: var(--color-teal);
    cursor: pointer;
  }

  .edit-conflict-btn:hover {
    text-decoration: underline;
  }

  .conflict-edit-form {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    width: 100%;
    font-size: 0.8125rem;
  }

  .conflict-edit-kind {
    display: flex;
    gap: var(--space-3);
    font-size: 0.75rem;
  }

  .conflict-edit-kind label {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    cursor: pointer;
  }

  .conflict-edit-times {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .conflict-edit-sep {
    font-size: 0.75rem;
    color: var(--color-text-muted);
  }

  .conflict-edit-label {
    font: inherit;
    font-size: 0.8125rem;
    padding: var(--space-1) var(--space-2);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: var(--color-surface);
    color: var(--color-text);
  }

  .conflict-edit-label:focus {
    outline: none;
    border-color: var(--color-teal);
  }

  .conflict-edit-actions {
    display: flex;
    gap: var(--space-2);
    justify-content: flex-end;
  }

  .save-conflict-btn {
    font: inherit;
    font-size: 0.75rem;
    font-weight: 600;
    padding: var(--space-1) var(--space-3);
    border: 1px solid var(--color-teal);
    border-radius: var(--radius-sm);
    background: var(--color-teal);
    color: #fff;
    cursor: pointer;
  }

  .conflict-info strong {
    color: var(--color-text);
  }

  .conflict-range {
    color: var(--color-warning);
    font-weight: 600;
    font-size: 0.75rem;
  }

  .conflict-label {
    color: var(--color-text-muted);
    font-size: 0.75rem;
  }

  .conflict-form {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-3);
    background: var(--color-bg-alt);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
  }

  .conflict-form select {
    font: inherit;
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--color-border-strong);
    border-radius: var(--radius-sm);
    background: var(--color-surface);
    color: var(--color-text);
    width: 100%;
  }

  .kind-row {
    display: flex;
    gap: var(--space-4);
  }

  .kind-option {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    font-size: 0.8125rem;
    text-transform: none;
    letter-spacing: 0;
    color: var(--color-text);
    font-weight: 500;
    cursor: pointer;
  }

  .form-actions {
    display: flex;
    justify-content: flex-end;
    align-items: center;
    gap: var(--space-3);
    margin-top: var(--space-1);
  }

  .add-call-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  @media (max-width: 900px) {
    /* Mobile: revert to the fullscreen slide-in overlay with backdrop. */
    .backdrop {
      display: block;
      position: fixed;
      inset: 0;
      background: rgba(45, 31, 61, 0.35);
      z-index: 50;
    }
    .editor {
      position: fixed;
      top: 0;
      right: 0;
      bottom: 0;
      width: 100vw;
      max-height: none;
      border: none;
      border-left: 1px solid var(--color-border);
      border-radius: 0;
      box-shadow: var(--shadow-lg);
      z-index: 60;
    }
  }
</style>
