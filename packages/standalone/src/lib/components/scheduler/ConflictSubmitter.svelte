<script lang="ts">
  /**
   * Actor-facing conflict submission form. Rendered on the public
   * /conflicts/[token] and /conflicts/[token]/[actorId] routes.
   *
   * The calendar + interaction model is modeled closely after
   * ActorConflictPicker.svelte (which directors use inside the Contacts
   * settings tab). Differences:
   * - Full page layout instead of modal
   * - Larger, touch-friendly cells
   * - Actor identification step (dropdown when actorId is null)
   * - Batches conflicts locally then submits all at once
   * - Post-submit confirmation screen
   * - "Add timed conflict" button as the primary mobile path since
   *   Ctrl+Click doesn't exist on phones
   */
  import type {
    CastMember,
    Conflict,
    CrewMember,
    IsoDate,
    ScheduleDoc,
  } from "@rehearsal-block/core";

  // Union of both person types so dropdown + display logic can handle
  // cast and crew uniformly.
  type Member = CastMember | CrewMember;
  function subtitleFor(m: Member): string {
    if ("character" in m) return m.character;
    if ("role" in m) return m.role;
    return "";
  }
  import {
    buildCalendarGrid,
    formatTime,
    formatUsDate,
    formatUsDateRange,
    isWeekRow,
  } from "@rehearsal-block/core";
  import { onMount } from "svelte";
  import TimePicker from "./TimePicker.svelte";

  interface Props {
    show: ScheduleDoc;
    /** If set, pre-select this actor and skip the dropdown. */
    actorId: string | null;
    /** Conflict share token, used as a key for localStorage. */
    token: string;
  }

  const { show, actorId: initialActorId, token }: Props = $props();

  type Submission = {
    id: string;
    actorId: string;
    actorName: string;
    conflicts: Conflict[];
    submittedAt: string;
  };

  // ---- State ----

  /** Which actor is currently submitting. Either prop-locked or dropdown. */
  let selectedActorId = $state<string | null>(initialActorId);

  /** Conflicts the actor has staged locally for this submission. */
  let stagedConflicts = $state<Conflict[]>([]);

  /** Whether the actor has successfully submitted. */
  let submitted = $state(false);

  /** Timestamp of last successful submission, for the confirmation screen. */
  let submittedAt = $state<string | null>(null);

  /** Active partial-conflict entry (Ctrl+Click or "Add timed" button). */
  let partialDate = $state<IsoDate | null>(null);
  let partialStart = $state("");
  let partialEnd = $state("");
  let partialLabel = $state("");

  /** Which conflict is showing the Edit/Remove actions overlay. */
  let activeConflictDate = $state<IsoDate | null>(null);

  /** Conflict currently being edited. */
  let editingConflict = $state<Conflict | null>(null);
  let editStart = $state("");
  let editEnd = $state("");
  let editLabel = $state("");
  let editKind = $state<"all-day" | "timed">("all-day");

  // ---- Derived ----

  const selectedActor = $derived<Member | null>(
    selectedActorId
      ? (show.cast as Member[]).find((m) => m.id === selectedActorId) ??
        (show.crew as Member[]).find((m) => m.id === selectedActorId) ??
        null
      : null,
  );

  const grid = $derived(
    buildCalendarGrid(show.show, {
      weekStartsOn: show.settings.weekStartsOn,
    }),
  );

  const conflictsByDate = $derived.by<Map<string, Conflict>>(() => {
    const map = new Map<string, Conflict>();
    for (const c of stagedConflicts) {
      map.set(c.date, c);
    }
    return map;
  });

  // ---- Lockout: disable edits past a deadline ----
  // When show.settings.conflictLockoutDate is set, actors can submit or
  // edit through the end of that day (local time). Starting midnight of
  // the next day, the page enters read-only "locked" mode.
  function todayLocalIso(): string {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  const lockoutDate = $derived(show.settings.conflictLockoutDate ?? null);
  const isLocked = $derived.by(() => {
    if (!lockoutDate) return false;
    return todayLocalIso() > lockoutDate;
  });

  const canSubmit = $derived(
    !isLocked && selectedActorId !== null && stagedConflicts.length > 0,
  );

  // ---- Persistence: load previous submission on mount ----

  function storageKeyForSubmissions(): string {
    return `rehearsal-block:conflict-submissions:${token}`;
  }

  function readSubmissions(): Submission[] {
    try {
      const raw = localStorage.getItem(storageKeyForSubmissions());
      if (!raw) return [];
      return JSON.parse(raw) as Submission[];
    } catch {
      return [];
    }
  }

  function writeSubmissions(subs: Submission[]) {
    localStorage.setItem(storageKeyForSubmissions(), JSON.stringify(subs));
  }

  /** If the actor already submitted, load their previous conflicts for editing. */
  onMount(() => {
    if (!selectedActorId) return;
    const subs = readSubmissions();
    const mine = subs.find((s) => s.actorId === selectedActorId);
    if (mine) {
      stagedConflicts = [...mine.conflicts];
      // Don't set submitted=true - let them edit and resubmit
    }
  });

  // Reload staged conflicts when the actor dropdown changes (single-link mode)
  $effect(() => {
    // Only react when the actor selection changes, not when stagedConflicts itself changes
    const id = selectedActorId;
    if (!id || initialActorId) return; // per-actor mode handles this via onMount
    const subs = readSubmissions();
    const mine = subs.find((s) => s.actorId === id);
    stagedConflicts = mine ? [...mine.conflicts] : [];
  });

  // ---- Calendar interaction ----

  function makeConflict(iso: IsoDate, opts?: { startTime?: string; endTime?: string; label?: string }): Conflict {
    return {
      id: `conf_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      actorId: selectedActorId ?? "",
      date: iso,
      label: opts?.label ?? "",
      ...(opts?.startTime && opts?.endTime
        ? { startTime: opts.startTime, endTime: opts.endTime }
        : {}),
    };
  }

  function handleCellClick(iso: IsoDate, ctrlKey: boolean) {
    if (!selectedActorId) return; // need an actor first
    if (isLocked) return; // past the deadline - no edits allowed
    const existing = conflictsByDate.get(iso);
    if (ctrlKey) {
      // Open timed-conflict form for this date
      activeConflictDate = null;
      openPartialForm(iso);
    } else if (existing) {
      // Show actions row for this date
      activeConflictDate = activeConflictDate === iso ? null : iso;
    } else {
      // Add a new full-day conflict
      activeConflictDate = null;
      stagedConflicts = [...stagedConflicts, makeConflict(iso)];
    }
  }

  function openPartialForm(iso: IsoDate) {
    partialDate = iso;
    partialStart = "";
    partialEnd = "";
    partialLabel = "";
  }

  function submitPartial() {
    if (!partialDate || !partialStart || !partialEnd) return;
    // Remove any existing conflict for this date (we're replacing with timed)
    stagedConflicts = stagedConflicts.filter((c) => c.date !== partialDate);
    stagedConflicts = [
      ...stagedConflicts,
      makeConflict(partialDate, {
        startTime: partialStart,
        endTime: partialEnd,
        label: partialLabel.trim(),
      }),
    ];
    partialDate = null;
  }

  function cancelPartial() {
    partialDate = null;
  }

  function removeActiveConflict() {
    if (!activeConflictDate) return;
    stagedConflicts = stagedConflicts.filter((c) => c.date !== activeConflictDate);
    activeConflictDate = null;
  }

  function editActiveConflict() {
    if (!activeConflictDate) return;
    const c = conflictsByDate.get(activeConflictDate);
    if (!c) return;
    editingConflict = c;
    editKind = c.startTime ? "timed" : "all-day";
    editStart = c.startTime ?? "";
    editEnd = c.endTime ?? "";
    editLabel = c.label ?? "";
    activeConflictDate = null;
  }

  function saveEditConflict() {
    if (!editingConflict) return;
    const date = editingConflict.date;
    // Remove the old version
    stagedConflicts = stagedConflicts.filter((c) => c.id !== editingConflict!.id);
    stagedConflicts = [
      ...stagedConflicts,
      makeConflict(date, {
        label: editLabel.trim(),
        ...(editKind === "timed" && editStart && editEnd
          ? { startTime: editStart, endTime: editEnd }
          : {}),
      }),
    ];
    editingConflict = null;
  }

  function cancelEdit() {
    editingConflict = null;
  }

  // ---- Add timed conflict (mobile-friendly entry point) ----

  let addTimedOpen = $state(false);
  let addTimedDate = $state<IsoDate>("");
  let addTimedStart = $state("");
  let addTimedEnd = $state("");
  let addTimedLabel = $state("");

  function openAddTimedModal() {
    addTimedDate = show.show.startDate;
    addTimedStart = "";
    addTimedEnd = "";
    addTimedLabel = "";
    addTimedOpen = true;
  }

  function submitAddTimed() {
    if (!addTimedDate || !addTimedStart || !addTimedEnd) return;
    // Remove any existing conflict for this date
    stagedConflicts = stagedConflicts.filter((c) => c.date !== addTimedDate);
    stagedConflicts = [
      ...stagedConflicts,
      makeConflict(addTimedDate, {
        startTime: addTimedStart,
        endTime: addTimedEnd,
        label: addTimedLabel.trim(),
      }),
    ];
    addTimedOpen = false;
  }

  // ---- Submit ----

  function displayNameFor(m: Member): string {
    const parts = [m.firstName, m.lastName].filter(Boolean);
    return parts.join(" ").trim() || "Unknown";
  }

  function handleSubmit() {
    if (!selectedActor || !canSubmit) return;
    const subs = readSubmissions();
    // Replace any existing submission for this actor (LWW)
    const filtered = subs.filter((s) => s.actorId !== selectedActor.id);
    const next: Submission = {
      id: `sub_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      actorId: selectedActor.id,
      actorName: displayNameFor(selectedActor),
      conflicts: stagedConflicts,
      submittedAt: new Date().toISOString(),
    };
    writeSubmissions([...filtered, next]);
    submittedAt = next.submittedAt;
    submitted = true;
  }

  function continueEditing() {
    submitted = false;
  }

  // ---- Sorting helper for the list below the calendar ----

  const sortedConflicts = $derived([...stagedConflicts].sort((a, b) => a.date.localeCompare(b.date)));

  function monthLabel(month: number): string {
    return ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][month];
  }
</script>

<div class="page">
  <div class="container">
    <header class="page-header">
      <div class="eyebrow">Conflict request for</div>
      <h1>{show.show.name}</h1>
      <p class="dates">{formatUsDateRange(show.show.startDate, show.show.endDate)}</p>
    </header>

    {#if submitted}
      <!-- Confirmation screen -->
      <section class="confirmation">
        <div class="confirm-icon" aria-hidden="true">
          <svg width="56" height="56" viewBox="0 -960 960 960" fill="currentColor">
            <path d="M382-240 154-468l57-57 171 171 367-367 57 57-424 424Z"/>
          </svg>
        </div>
        <h2>Thank you, {selectedActor?.firstName}!</h2>
        <p>
          Your conflicts have been sent to the director. You can return to this link anytime to update them if anything changes.
        </p>
        <p class="submission-count">
          {stagedConflicts.length} conflict{stagedConflicts.length === 1 ? "" : "s"} submitted
        </p>
        <button type="button" class="btn-ghost" onclick={continueEditing}>
          Update my conflicts
        </button>
      </section>
    {:else}
      <!-- Person identification -->
      {#if !initialActorId}
        <section class="section">
          <label class="section-label" for="actor-select">Who are you?</label>
          <select
            id="actor-select"
            class="actor-select"
            bind:value={selectedActorId}
          >
            <option value={null}>- Select your name -</option>
            {#if show.cast.length > 0}
              <optgroup label="Cast">
                {#each show.cast as member (member.id)}
                  <option value={member.id}>
                    {displayNameFor(member)}{member.character ? ` (${member.character})` : ""}
                  </option>
                {/each}
              </optgroup>
            {/if}
            {#if show.crew.length > 0}
              <optgroup label="Production Team">
                {#each show.crew as member (member.id)}
                  <option value={member.id}>
                    {displayNameFor(member)}{member.role ? ` (${member.role})` : ""}
                  </option>
                {/each}
              </optgroup>
            {/if}
          </select>
        </section>
      {:else if selectedActor}
        <section class="section identification">
          <div class="name-chip">
            <span class="name-dot" style:background={selectedActor.color}></span>
            <div>
              <div class="greeting">Hi, {selectedActor.firstName}!</div>
              {#if subtitleFor(selectedActor)}
                <div class="character">{subtitleFor(selectedActor)}</div>
              {/if}
            </div>
          </div>
        </section>
      {/if}

      {#if selectedActor}
        <!-- Lockout / Deadline notice -->
        {#if isLocked}
          <section class="lockout-banner locked">
            <svg width="20" height="20" viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true">
              <path d="M240-80q-33 0-56.5-23.5T160-160v-400q0-33 23.5-56.5T240-640h40v-80q0-83 58.5-141.5T480-920q83 0 141.5 58.5T680-720v80h40q33 0 56.5 23.5T800-560v400q0 33-23.5 56.5T720-80H240Zm0-80h480v-400H240v400Zm240-120q33 0 56.5-23.5T560-360q0-33-23.5-56.5T480-440q-33 0-56.5 23.5T400-360q0 33 23.5 56.5T480-280ZM360-640h240v-80q0-50-35-85t-85-35q-50 0-85 35t-35 85v80ZM240-160v-400 400Z"/>
            </svg>
            <div>
              <strong>The deadline to submit conflicts has passed.</strong>
              <p>
                This link closed on {formatUsDate(lockoutDate!)}. You can still see {stagedConflicts.length > 0 ? "your submitted conflicts below" : "this page"}, but you can't add or change anything. Contact the director if you need to update your conflicts.
              </p>
            </div>
          </section>
        {:else if lockoutDate}
          <section class="lockout-banner deadline">
            <svg width="20" height="20" viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true">
              <path d="m612-292 56-56-148-148v-184h-80v216l172 172ZM480-80q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Zm0-400Zm0 320q133 0 226.5-93.5T800-480q0-133-93.5-226.5T480-800q-133 0-226.5 93.5T160-480q0 133 93.5 226.5T480-160Z"/>
            </svg>
            <div>
              <strong>You can add or edit your conflicts through {formatUsDate(lockoutDate)}.</strong>
              <p>After that, this link will become read-only.</p>
            </div>
          </section>
        {/if}

        {#if !isLocked}
          <!-- Instructions -->
          <section class="instructions">
            <p>
              Click any date you're <strong>not available</strong> for rehearsal. Click an existing conflict to edit or remove it. Need a partial conflict (e.g. only unavailable 2-5pm)?
              <strong class="ctrl-hint">Ctrl+Click</strong>
              a date or use the button below.
            </p>
            <button type="button" class="btn-add-timed" onclick={openAddTimedModal}>
              <svg width="14" height="14" viewBox="0 -960 960 960" fill="currentColor"><path d="M440-440H200v-80h240v-240h80v240h240v80H520v240h-80v-240Z"/></svg>
              Add timed conflict
            </button>
          </section>
        {/if}

        <!-- Calendar -->
        <section class="calendar-section">
          <div class="weekdays">
            {#each grid.weekdayHeaders as label (label)}
              <div class="weekday">{label}</div>
            {/each}
          </div>

          <div class="cal">
            {#each grid.rows as row, i (i)}
              {#if isWeekRow(row)}
                <div class="week-row">
                  {#each row.cells as cell (cell.date)}
                    {@const conflict = cell.inRange ? conflictsByDate.get(cell.date) : undefined}
                    {@const showMonth = cell.dayOfMonth === 1 || cell.date === show.show.startDate}
                    {#if cell.inRange}
                      <button
                        type="button"
                        class="cal-cell"
                        class:conflicted={!!conflict}
                        class:active-cell={activeConflictDate === cell.date}
                        class:locked={isLocked}
                        disabled={isLocked}
                        title={conflict ? `${cell.date}${isLocked ? ' - conflict' : ' - click for options'}` : cell.date}
                        onclick={(e) => handleCellClick(cell.date, e.ctrlKey || e.metaKey)}
                      >
                        <span class="cell-num">{cell.dayOfMonth}</span>
                        {#if showMonth}
                          <span class="cell-month">{monthLabel(cell.month)}</span>
                        {/if}
                        {#if conflict?.startTime}
                          <span class="cell-partial-dot" aria-label="timed"></span>
                        {/if}
                      </button>
                    {:else}
                      <div class="cal-cell placeholder" aria-hidden="true"></div>
                    {/if}
                  {/each}
                </div>
                {#if !isLocked && row.cells.some((c) => c.date === activeConflictDate)}
                  {@const activeConflict = conflictsByDate.get(activeConflictDate!)}
                  <div class="cell-actions-row">
                    <span class="cell-actions-info">
                      {#if activeConflict?.startTime}
                        {formatTime(activeConflict.startTime, show.settings.timeFormat ?? "12h")} - {formatTime(activeConflict.endTime ?? "", show.settings.timeFormat ?? "12h")}
                      {:else}
                        Full day
                      {/if}
                      {#if activeConflict?.label}
                        <span class="cell-actions-lbl">- {activeConflict.label}</span>
                      {/if}
                    </span>
                    <button type="button" class="cell-action-btn cell-action-edit" onclick={editActiveConflict}>Edit</button>
                    <button type="button" class="cell-action-btn cell-action-danger" onclick={removeActiveConflict}>Remove</button>
                  </div>
                {/if}
              {/if}
            {/each}
          </div>
        </section>

        <!-- Staged list -->
        {#if sortedConflicts.length > 0}
          <section class="section">
            <h3 class="section-heading">Your conflicts ({sortedConflicts.length})</h3>
            <ul class="conflict-list">
              {#each sortedConflicts as c (c.id)}
                <li class="conflict-item">
                  <div>
                    <strong>{formatUsDate(c.date)}</strong>
                    <span class="conflict-when">
                      {#if c.startTime && c.endTime}
                        {formatTime(c.startTime, show.settings.timeFormat ?? "12h")} - {formatTime(c.endTime, show.settings.timeFormat ?? "12h")}
                      {:else}
                        Full day
                      {/if}
                    </span>
                    {#if c.label}
                      <span class="conflict-label">{c.label}</span>
                    {/if}
                  </div>
                </li>
              {/each}
            </ul>
          </section>
        {/if}

        {#if !isLocked}
          <!-- Submit -->
          <section class="submit-row">
            <button
              type="button"
              class="btn-submit"
              disabled={!canSubmit}
              onclick={handleSubmit}
            >
              Submit {stagedConflicts.length > 0 ? `${stagedConflicts.length} conflict${stagedConflicts.length === 1 ? "" : "s"}` : ""}
            </button>
            <p class="submit-hint">
              {lockoutDate
                ? `You can return to this link to make changes through ${formatUsDate(lockoutDate)}.`
                : "You can return to this link later to make changes."}
            </p>
          </section>
        {/if}
      {/if}
    {/if}
  </div>
</div>

<!-- Inline partial conflict form (triggered by Ctrl+Click on a date) -->
{#if partialDate}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="modal-backdrop" onclick={cancelPartial}></div>
  <div class="modal">
    <h3>Timed conflict - {formatUsDate(partialDate)}</h3>
    <p class="modal-hint">Only unavailable for part of the day? Enter your unavailable time range.</p>
    <div class="time-row">
      <div class="time-field">
        <span class="time-field-label">Start</span>
        <TimePicker
          value={partialStart}
          compact
          timeFormat={show.settings.timeFormat ?? "12h"}
          minuteStep={show.settings.timeIncrementMinutes ?? 15}
          onchange={(v) => (partialStart = v)}
        />
      </div>
      <div class="time-field">
        <span class="time-field-label">End</span>
        <TimePicker
          value={partialEnd}
          compact
          timeFormat={show.settings.timeFormat ?? "12h"}
          minuteStep={show.settings.timeIncrementMinutes ?? 15}
          minTime={partialStart}
          onchange={(v) => (partialEnd = v)}
        />
      </div>
    </div>
    <label class="text-field">
      <span>Label (optional)</span>
      <input type="text" bind:value={partialLabel} placeholder="e.g. Work, Doctor appt" />
    </label>
    <div class="modal-actions">
      <button type="button" class="btn-ghost" onclick={cancelPartial}>Cancel</button>
      <button
        type="button"
        class="btn-primary"
        disabled={!partialStart || !partialEnd}
        onclick={submitPartial}
      >
        Add conflict
      </button>
    </div>
  </div>
{/if}

<!-- Edit conflict modal -->
{#if editingConflict}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="modal-backdrop" onclick={cancelEdit}></div>
  <div class="modal">
    <h3>Edit conflict - {formatUsDate(editingConflict.date)}</h3>
    <div class="radio-row">
      <label>
        <input type="radio" value="all-day" bind:group={editKind} />
        Full day
      </label>
      <label>
        <input type="radio" value="timed" bind:group={editKind} />
        Timed
      </label>
    </div>
    {#if editKind === "timed"}
      <div class="time-row">
        <div class="time-field">
          <span class="time-field-label">Start</span>
          <TimePicker
            value={editStart}
            compact
            timeFormat={show.settings.timeFormat ?? "12h"}
            minuteStep={show.settings.timeIncrementMinutes ?? 15}
            onchange={(v) => (editStart = v)}
          />
        </div>
        <div class="time-field">
          <span class="time-field-label">End</span>
          <TimePicker
            value={editEnd}
            compact
            timeFormat={show.settings.timeFormat ?? "12h"}
            minuteStep={show.settings.timeIncrementMinutes ?? 15}
            minTime={editStart}
            onchange={(v) => (editEnd = v)}
          />
        </div>
      </div>
    {/if}
    <label class="text-field">
      <span>Label (optional)</span>
      <input type="text" bind:value={editLabel} placeholder="e.g. Work, Doctor appt" />
    </label>
    <div class="modal-actions">
      <button type="button" class="btn-ghost" onclick={cancelEdit}>Cancel</button>
      <button type="button" class="btn-primary" onclick={saveEditConflict}>Save</button>
    </div>
  </div>
{/if}

<!-- Add Timed (mobile-friendly) modal -->
{#if addTimedOpen}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="modal-backdrop" onclick={() => (addTimedOpen = false)}></div>
  <div class="modal">
    <h3>Add timed conflict</h3>
    <p class="modal-hint">Pick a date and your unavailable time range.</p>
    <label class="text-field">
      <span>Date</span>
      <input
        type="date"
        bind:value={addTimedDate}
        min={show.show.startDate}
        max={show.show.endDate}
      />
    </label>
    <div class="time-row">
      <div class="time-field">
        <span class="time-field-label">Start</span>
        <TimePicker
          value={addTimedStart}
          compact
          timeFormat={show.settings.timeFormat ?? "12h"}
          minuteStep={show.settings.timeIncrementMinutes ?? 15}
          onchange={(v) => (addTimedStart = v)}
        />
      </div>
      <div class="time-field">
        <span class="time-field-label">End</span>
        <TimePicker
          value={addTimedEnd}
          compact
          timeFormat={show.settings.timeFormat ?? "12h"}
          minuteStep={show.settings.timeIncrementMinutes ?? 15}
          minTime={addTimedStart}
          onchange={(v) => (addTimedEnd = v)}
        />
      </div>
    </div>
    <label class="text-field">
      <span>Label (optional)</span>
      <input type="text" bind:value={addTimedLabel} placeholder="e.g. Work, Doctor appt" />
    </label>
    <div class="modal-actions">
      <button type="button" class="btn-ghost" onclick={() => (addTimedOpen = false)}>Cancel</button>
      <button
        type="button"
        class="btn-primary"
        disabled={!addTimedDate || !addTimedStart || !addTimedEnd}
        onclick={submitAddTimed}
      >
        Add conflict
      </button>
    </div>
  </div>
{/if}

<style>
  .page {
    min-height: 100vh;
    background: var(--color-bg-alt);
    padding: var(--space-5) var(--space-4);
  }

  .container {
    max-width: 640px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
  }

  .page-header {
    text-align: center;
    padding-bottom: var(--space-4);
    border-bottom: 1px solid var(--color-border);
  }

  .eyebrow {
    font-size: 0.6875rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--color-text-subtle);
    margin-bottom: var(--space-1);
  }

  .page-header h1 {
    font-family: var(--font-display, inherit);
    font-size: 1.75rem;
    font-weight: 700;
    margin: 0;
    color: var(--color-plum);
  }

  .dates {
    font-size: 0.9375rem;
    color: var(--color-text-muted);
    margin: var(--space-1) 0 0;
  }

  .section {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .section-label {
    font-size: 0.6875rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--color-text-subtle);
  }

  .section-heading {
    font-size: 0.875rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--color-text-subtle);
    margin: 0 0 var(--space-2);
  }

  .actor-select {
    font: inherit;
    font-size: 1rem;
    padding: var(--space-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-surface);
    color: var(--color-text);
    cursor: pointer;
  }
  .actor-select:focus {
    outline: 2px solid var(--color-teal);
    outline-offset: 2px;
    border-color: var(--color-teal);
  }

  .identification {
    padding: var(--space-3) var(--space-4);
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
  }

  .name-chip {
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }

  .name-dot {
    width: 14px;
    height: 14px;
    border-radius: var(--radius-full);
    flex-shrink: 0;
  }

  .greeting {
    font-size: 1.125rem;
    font-weight: 700;
    color: var(--color-plum);
  }

  .character {
    font-size: 0.8125rem;
    color: var(--color-text-muted);
  }

  .instructions {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-4);
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
  }

  .instructions p {
    font-size: 0.8125rem;
    color: var(--color-text-muted);
    margin: 0;
    line-height: 1.5;
  }

  .ctrl-hint {
    color: var(--color-plum);
    white-space: nowrap;
  }

  .btn-add-timed {
    align-self: flex-start;
    font: inherit;
    font-size: 0.8125rem;
    font-weight: 600;
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--color-teal);
    border-radius: var(--radius-md);
    background: transparent;
    color: var(--color-teal);
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    transition: all var(--transition-fast);
  }
  .btn-add-timed:hover {
    background: var(--color-teal);
    color: var(--color-text-inverse);
  }

  .calendar-section {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-4);
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
  }

  .weekdays {
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
    gap: 4px;
  }

  .weekday {
    font-size: 0.6875rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--color-text-subtle);
    font-weight: 700;
    text-align: center;
    padding: 4px 0;
  }

  .cal {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .week-row {
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
    gap: 4px;
  }

  .cal-cell {
    position: relative;
    aspect-ratio: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    font: inherit;
    font-size: 0.9375rem;
    font-weight: 600;
    padding: 2px;
    background: var(--color-surface);
    color: var(--color-text);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: transform var(--transition-fast), border-color var(--transition-fast), background var(--transition-fast);
    min-height: 44px;
  }
  .cal-cell:hover:not(.placeholder) {
    transform: scale(1.04);
    border-color: var(--color-plum);
  }
  .cal-cell.conflicted {
    background: #fef3c7;
    border-color: #f59e0b;
    color: #92400e;
  }
  .cal-cell.active-cell {
    border-color: var(--color-teal);
    box-shadow: 0 0 0 2px var(--color-teal);
  }
  .cal-cell.placeholder {
    background: transparent;
    border-color: transparent;
    cursor: default;
  }
  .cal-cell.locked {
    cursor: default;
  }
  .cal-cell.locked:hover:not(.placeholder) {
    transform: none;
    border-color: var(--color-border);
  }
  .cal-cell.locked.conflicted:hover {
    border-color: #f59e0b;
  }
  .cal-cell:disabled {
    cursor: default;
  }

  .lockout-banner {
    display: flex;
    align-items: flex-start;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-4);
    border-radius: var(--radius-md);
    border: 1px solid;
  }
  .lockout-banner strong {
    font-size: 0.875rem;
    display: block;
    line-height: 1.3;
  }
  .lockout-banner p {
    font-size: 0.8125rem;
    margin: var(--space-1) 0 0;
    line-height: 1.4;
  }
  .lockout-banner.deadline {
    background: #f0fdfa;
    border-color: var(--color-teal);
    color: var(--color-teal-dark);
  }
  .lockout-banner.deadline strong {
    color: var(--color-teal-dark);
  }
  .lockout-banner.deadline svg {
    color: var(--color-teal);
    flex-shrink: 0;
  }
  .lockout-banner.locked {
    background: #fef3c7;
    border-color: #f59e0b;
    color: #92400e;
  }
  .lockout-banner.locked strong {
    color: #78350f;
  }
  .lockout-banner.locked svg {
    color: #b45309;
    flex-shrink: 0;
  }

  .cell-num {
    line-height: 1;
  }

  .cell-month {
    font-size: 0.5625rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--color-text-subtle);
    font-weight: 600;
    margin-top: 2px;
  }
  .cal-cell.conflicted .cell-month {
    color: #92400e;
  }

  .cell-partial-dot {
    position: absolute;
    bottom: 4px;
    left: 50%;
    transform: translateX(-50%);
    width: 5px;
    height: 5px;
    border-radius: var(--radius-full);
    background: #f59e0b;
  }

  .cell-actions-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    background: var(--color-bg-alt);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    flex-wrap: wrap;
  }

  .cell-actions-info {
    font-size: 0.8125rem;
    color: var(--color-text);
    flex: 1;
    min-width: 0;
  }

  .cell-actions-lbl {
    color: var(--color-text-muted);
  }

  .cell-action-btn {
    font: inherit;
    font-size: 0.75rem;
    font-weight: 600;
    padding: var(--space-1) var(--space-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: var(--color-surface);
    color: var(--color-text-muted);
    cursor: pointer;
  }
  .cell-action-edit:hover {
    border-color: var(--color-plum);
    color: var(--color-plum);
  }
  .cell-action-danger:hover {
    border-color: var(--color-danger);
    color: var(--color-danger);
  }

  .conflict-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .conflict-item {
    padding: var(--space-2) var(--space-3);
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    font-size: 0.8125rem;
  }

  .conflict-item strong {
    color: var(--color-plum);
    margin-right: var(--space-2);
  }

  .conflict-when {
    color: var(--color-text-muted);
  }

  .conflict-label {
    color: var(--color-text-muted);
    font-style: italic;
    margin-left: var(--space-2);
  }

  .submit-row {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2);
    padding-top: var(--space-4);
  }

  .btn-submit {
    font: inherit;
    font-size: 1rem;
    font-weight: 700;
    padding: var(--space-3) var(--space-6);
    border: none;
    border-radius: var(--radius-md);
    background: var(--color-teal);
    color: var(--color-text-inverse);
    cursor: pointer;
    transition: background var(--transition-fast);
    min-width: 220px;
  }
  .btn-submit:hover:not(:disabled) {
    background: var(--color-teal-dark);
  }
  .btn-submit:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .submit-hint {
    font-size: 0.75rem;
    color: var(--color-text-muted);
    margin: 0;
    text-align: center;
  }

  .confirmation {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-6) var(--space-4);
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    text-align: center;
  }

  .confirm-icon {
    width: 88px;
    height: 88px;
    border-radius: var(--radius-full);
    background: var(--color-teal);
    color: var(--color-text-inverse);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .confirmation h2 {
    font-family: var(--font-display, inherit);
    font-size: 1.5rem;
    font-weight: 700;
    margin: 0;
    color: var(--color-plum);
  }

  .confirmation p {
    font-size: 0.9375rem;
    color: var(--color-text-muted);
    margin: 0;
    max-width: 440px;
    line-height: 1.5;
  }

  .submission-count {
    font-weight: 700;
    color: var(--color-teal) !important;
  }

  .btn-ghost {
    font: inherit;
    font-size: 0.8125rem;
    font-weight: 600;
    padding: var(--space-2) var(--space-4);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: transparent;
    color: var(--color-text-muted);
    cursor: pointer;
  }
  .btn-ghost:hover {
    color: var(--color-text);
    border-color: var(--color-text-muted);
  }

  /* ---- Modals (timed conflict, edit, add-timed) ---- */

  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(45, 31, 61, 0.5);
    z-index: 200;
  }

  .modal {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 420px;
    max-width: calc(100vw - 2 * var(--space-4));
    max-height: calc(100vh - 2 * var(--space-4));
    background: var(--color-surface);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-lg);
    z-index: 210;
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding: var(--space-5);
    overflow: auto;
  }

  .modal h3 {
    font-size: 1rem;
    font-weight: 700;
    margin: 0;
    color: var(--color-plum);
  }

  .modal-hint {
    font-size: 0.8125rem;
    color: var(--color-text-muted);
    margin: 0;
  }

  .time-row {
    display: flex;
    gap: var(--space-3);
  }

  .time-field {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .time-field-label,
  .text-field span {
    font-size: 0.6875rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--color-text-subtle);
  }

  .text-field {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .text-field input,
  .modal input[type="date"] {
    font: inherit;
    font-size: 0.875rem;
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: var(--color-surface);
    color: var(--color-text);
  }
  .text-field input:focus,
  .modal input[type="date"]:focus {
    outline: 2px solid var(--color-teal);
    outline-offset: 1px;
    border-color: var(--color-teal);
  }

  .radio-row {
    display: flex;
    gap: var(--space-4);
  }

  .radio-row label {
    font-size: 0.8125rem;
    color: var(--color-text);
    cursor: pointer;
  }

  .modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2);
    margin-top: var(--space-2);
  }

  .btn-primary {
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
  .btn-primary:hover:not(:disabled) {
    background: var(--color-plum-light);
  }
  .btn-primary:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  @media (max-width: 520px) {
    .page {
      padding: var(--space-4) var(--space-2);
    }
    .page-header h1 {
      font-size: 1.375rem;
    }
    .calendar-section {
      padding: var(--space-3) var(--space-2);
    }
    .cal-cell {
      font-size: 0.875rem;
      min-height: 44px;
    }
    .cell-month {
      font-size: 0.5rem;
    }
    .btn-submit {
      width: 100%;
      min-width: 0;
    }
    .time-row {
      flex-direction: column;
    }
    .week-row {
      gap: 3px;
    }
    .instructions {
      padding: var(--space-3);
    }
    .btn-add-timed {
      align-self: stretch;
      justify-content: center;
    }
  }
</style>
