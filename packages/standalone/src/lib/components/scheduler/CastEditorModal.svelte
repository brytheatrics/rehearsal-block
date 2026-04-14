<script lang="ts">
  /**
   * Full cast management modal. Directors can add, edit, remove, and
   * reorder cast members; assign colors from a palette; set pronouns,
   * contact info, and character assignments; and open a per-actor
   * conflict calendar picker.
   *
   * Controlled: the parent owns `doc` state and this component emits
   * granular mutations via callback props. Same pattern as DefaultsModal.
   */
  import type {
    CastMember,
    Conflict,
    IsoDate,
    ScheduleDoc,
  } from "@rehearsal-block/core";
  import { CAST_COLOR_PALETTE } from "@rehearsal-block/core";
  import ActorConflictPicker from "./ActorConflictPicker.svelte";

  interface Props {
    show: ScheduleDoc;
    /** When true, all editing is disabled - inputs are read-only, add/delete
     *  buttons are hidden. The modal becomes a read-only cast viewer with
     *  a "purchase to edit" banner. Conflict calendar still works. */
    readOnly?: boolean;
    onaddmember: (member: CastMember) => void;
    onupdatemember: (id: string, patch: Partial<CastMember>) => void;
    onremovemember: (id: string) => void;
    onreordermember: (id: string, direction: "up" | "down") => void;
    onaddconflict: (conflict: Conflict) => void;
    onremoveconflict: (id: string) => void;
    onclose: () => void;
  }

  const {
    show,
    readOnly = false,
    onaddmember,
    onupdatemember,
    onremovemember,
    onreordermember,
    onaddconflict,
    onremoveconflict,
    onclose,
  }: Props = $props();

  let modalBodyEl = $state<HTMLDivElement | null>(null);

  // Color popover: which member's color picker is open (null = none).
  let colorPopoverFor = $state<string | null>(null);

  // Conflict picker: which actor's calendar is open (null = none).
  let conflictPickerFor = $state<string | null>(null);
  const conflictPickerMember = $derived(
    conflictPickerFor
      ? show.cast.find((m) => m.id === conflictPickerFor) ?? null
      : null,
  );

  // Delete confirmation
  let deleteConfirmFor = $state<string | null>(null);

  function addMember() {
    const colorIndex = show.cast.length % CAST_COLOR_PALETTE.length;
    const member: CastMember = {
      id: `actor_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      firstName: "",
      lastName: "",
      character: "",
      color: CAST_COLOR_PALETTE[colorIndex] ?? "#424242",
    };
    onaddmember(member);
    // Scroll the new card into view after it renders.
    queueMicrotask(() => {
      const cards = modalBodyEl?.querySelectorAll(".actor-card");
      const last = cards?.[cards.length - 1];
      last?.scrollIntoView({ block: "center", behavior: "auto" });
      // Auto-focus the first name input so the director can start typing.
      const firstInput = last?.querySelector<HTMLInputElement>(".field-first");
      firstInput?.focus();
    });
  }

  function requestDelete(id: string) {
    // Check if actor is called anywhere
    const calledOnDays = Object.values(show.schedule).some((day) =>
      day.calls.some(
        (c) =>
          c.calledActorIds.includes(id) ||
          c.allCalled,
      ),
    );
    if (calledOnDays) {
      deleteConfirmFor = id;
      return;
    }
    onremovemember(id);
  }

  function confirmDelete() {
    if (!deleteConfirmFor) return;
    onremovemember(deleteConfirmFor);
    deleteConfirmFor = null;
  }

  function conflictCountFor(actorId: string): number {
    return show.conflicts.filter((c) => c.actorId === actorId).length;
  }

  function onBackdropKey(e: KeyboardEvent) {
    if (e.key === "Escape") {
      if (conflictPickerFor) {
        conflictPickerFor = null;
        return;
      }
      if (deleteConfirmFor) {
        deleteConfirmFor = null;
        return;
      }
      if (colorPopoverFor) {
        colorPopoverFor = null;
        return;
      }
      onclose();
    }
  }
</script>

<svelte:window onkeydown={onBackdropKey} />

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="backdrop"
  onclick={() => {
    if (colorPopoverFor) { colorPopoverFor = null; return; }
    onclose();
  }}
></div>

<div class="modal" role="dialog" aria-modal="true" aria-label="Cast editor">
  <header class="modal-header">
    <div>
      <div class="eyebrow">Cast</div>
      <h2>{show.cast.length} {show.cast.length === 1 ? "member" : "members"}</h2>
    </div>
    <div class="header-actions">
      {#if !readOnly}
        <button type="button" class="add-btn" onclick={addMember}>
          + Add actor
        </button>
      {/if}
      <button type="button" class="close-btn" onclick={onclose} aria-label="Close">
        ×
      </button>
    </div>
  </header>

  <div class="modal-body" bind:this={modalBodyEl}>
    {#if readOnly}
      <div class="read-only-banner">
        <a href="/buy" class="purchase-link">Purchase Rehearsal Block</a> to edit cast members, add actors, and manage your roster.
      </div>
    {/if}

    {#if show.cast.length === 0}
      <p class="empty">No cast members yet. Click "+ Add actor" to get started.</p>
    {/if}

    {#each show.cast as member, idx (member.id)}
      <div class="actor-card">
        <div class="actor-row-top">
          <!-- Color button -->
          <div class="color-anchor">
            <button
              type="button"
              class="color-btn"
              style:background={member.color}
              title={readOnly ? undefined : "Change color"}
              disabled={readOnly}
              aria-label={`Change color for ${member.firstName || "actor"}`}
              onclick={(e) => {
                if (readOnly) return;
                e.stopPropagation();
                colorPopoverFor = colorPopoverFor === member.id ? null : member.id;
              }}
            ></button>
            {#if colorPopoverFor === member.id}
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <div class="color-popover" onclick={(e) => e.stopPropagation()}>
                {#each CAST_COLOR_PALETTE as hex (hex)}
                  <button
                    type="button"
                    class="color-swatch"
                    class:selected={member.color === hex}
                    style:background={hex}
                    aria-label={hex}
                    onclick={() => {
                      onupdatemember(member.id, { color: hex });
                      colorPopoverFor = null;
                    }}
                  ></button>
                {/each}
              </div>
            {/if}
          </div>

          <!-- Name fields -->
          <input
            type="text"
            class="field field-first"
            value={member.firstName}
            placeholder="First"
            disabled={readOnly}
            oninput={(e) => onupdatemember(member.id, { firstName: e.currentTarget.value })}
          />
          <input
            type="text"
            class="field field-middle"
            value={member.middleName ?? ""}
            placeholder="Middle"
            disabled={readOnly}
            oninput={(e) => onupdatemember(member.id, { middleName: e.currentTarget.value || undefined })}
          />
          <input
            type="text"
            class="field field-last"
            value={member.lastName}
            placeholder="Last"
            disabled={readOnly}
            oninput={(e) => onupdatemember(member.id, { lastName: e.currentTarget.value })}
          />
          <input
            type="text"
            class="field field-suffix"
            value={member.suffix ?? ""}
            placeholder="Sfx"
            maxlength="5"
            disabled={readOnly}
            oninput={(e) => onupdatemember(member.id, { suffix: e.currentTarget.value || undefined })}
          />

          <!-- Reorder + delete (hidden in read-only mode) -->
          {#if !readOnly}
          <div class="row-actions">
            <button
              type="button"
              class="arrow-btn"
              disabled={idx === 0}
              title="Move up"
              aria-label="Move up"
              onclick={() => onreordermember(member.id, "up")}
            >
              ▲
            </button>
            <button
              type="button"
              class="arrow-btn"
              disabled={idx === show.cast.length - 1}
              title="Move down"
              aria-label="Move down"
              onclick={() => onreordermember(member.id, "down")}
            >
              ▼
            </button>
            <button
              type="button"
              class="delete-btn"
              title="Remove actor"
              aria-label={`Remove ${member.firstName || "actor"}`}
              onclick={() => requestDelete(member.id)}
            >
              ×
            </button>
          </div>
          {/if}
        </div>

        <div class="actor-row-bottom">
          <input
            type="text"
            class="field field-character"
            value={member.character}
            placeholder="Character"
            disabled={readOnly}
            oninput={(e) => onupdatemember(member.id, { character: e.currentTarget.value })}
          />
          <input
            type="text"
            class="field field-pronouns"
            value={member.pronouns ?? ""}
            placeholder="Pronouns"
            disabled={readOnly}
            oninput={(e) => onupdatemember(member.id, { pronouns: e.currentTarget.value || undefined })}
          />
          <input
            type="text"
            class="field field-email"
            value={member.email ?? ""}
            placeholder="Email"
            disabled={readOnly}
            oninput={(e) => onupdatemember(member.id, { email: e.currentTarget.value || undefined })}
          />
          <input
            type="text"
            class="field field-phone"
            value={member.phone ?? ""}
            placeholder="Phone"
            disabled={readOnly}
            oninput={(e) => onupdatemember(member.id, { phone: e.currentTarget.value || undefined })}
          />
          <button
            type="button"
            class="conflict-btn"
            title="Manage conflicts"
            aria-label={`Manage conflicts for ${member.firstName || "actor"}`}
            onclick={() => (conflictPickerFor = member.id)}
          >
            📅 <span class="conflict-count">{conflictCountFor(member.id)}</span>
          </button>
        </div>
      </div>
    {/each}
  </div>

  <footer class="modal-footer">
    <button type="button" class="btn btn-primary" onclick={onclose}>Done</button>
  </footer>
</div>

<!-- Delete confirmation -->
{#if deleteConfirmFor}
  {@const deleteMember = show.cast.find((m) => m.id === deleteConfirmFor)}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="confirm-backdrop" onclick={() => (deleteConfirmFor = null)}>
    <div
      class="confirm-modal"
      role="dialog"
      aria-modal="true"
      tabindex="-1"
      onclick={(e) => e.stopPropagation()}
    >
      <h3>Remove {deleteMember?.firstName} {deleteMember?.lastName}?</h3>
      <p>
        This actor is called on one or more days. Removing them will also
        remove them from all call rosters.
      </p>
      <div class="confirm-actions">
        <button type="button" class="btn btn-secondary" onclick={() => (deleteConfirmFor = null)}>
          Cancel
        </button>
        <button type="button" class="btn btn-danger" onclick={confirmDelete}>
          Remove
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- Per-actor conflict picker -->
{#if conflictPickerMember}
  <ActorConflictPicker
    {show}
    member={conflictPickerMember}
    {onaddconflict}
    {onremoveconflict}
    onclose={() => (conflictPickerFor = null)}
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
    width: 900px;
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
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    padding: var(--space-4) var(--space-5);
    border-bottom: 1px solid var(--color-border);
    gap: var(--space-3);
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
    font-size: 1.125rem;
    margin: 0;
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .add-btn {
    background: var(--color-plum);
    color: var(--color-text-inverse);
    border: none;
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-sm);
    font-size: 0.75rem;
    font-weight: 700;
    cursor: pointer;
  }
  .add-btn:hover {
    background: var(--color-plum-light);
  }

  .close-btn {
    background: transparent;
    border: none;
    font-size: 1.5rem;
    cursor: pointer;
    color: var(--color-text-muted);
    line-height: 1;
    padding: 0 var(--space-2);
    border-radius: var(--radius-sm);
  }
  .close-btn:hover {
    color: var(--color-plum);
  }

  .modal-body {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-4) var(--space-5);
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .read-only-banner {
    background: var(--color-info-bg);
    border: 1px solid var(--color-teal);
    border-radius: var(--radius-md);
    padding: var(--space-3) var(--space-4);
    font-size: 0.8125rem;
    color: var(--color-plum);
  }

  .purchase-link {
    color: var(--color-teal-dark);
    font-weight: 700;
    text-decoration: underline;
  }
  .purchase-link:hover {
    color: var(--color-plum);
  }

  .field:disabled,
  .color-btn:disabled {
    opacity: 0.6;
    cursor: default;
  }

  .empty {
    color: var(--color-text-muted);
    font-style: italic;
    text-align: center;
    padding: var(--space-6);
  }

  .actor-card {
    background: var(--color-bg-alt);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    padding: var(--space-3);
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .actor-row-top,
  .actor-row-bottom {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex-wrap: wrap;
  }

  .color-anchor {
    position: relative;
    flex-shrink: 0;
  }

  .color-btn {
    width: 1.5rem;
    height: 1.5rem;
    border-radius: var(--radius-full);
    border: 2px solid var(--color-surface);
    box-shadow: 0 0 0 1px var(--color-border-strong);
    cursor: pointer;
    padding: 0;
    transition: box-shadow var(--transition-fast);
  }
  .color-btn:hover {
    box-shadow: 0 0 0 2px var(--color-plum);
  }

  .color-popover {
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
    width: 180px;
  }

  .color-swatch {
    width: 24px;
    height: 24px;
    border-radius: var(--radius-full);
    border: 2px solid transparent;
    cursor: pointer;
    padding: 0;
    transition: transform var(--transition-fast);
  }
  .color-swatch:hover {
    transform: scale(1.15);
  }
  .color-swatch.selected {
    border-color: var(--color-plum);
    box-shadow: 0 0 0 2px var(--color-surface), 0 0 0 3px var(--color-plum);
  }

  .field {
    font: inherit;
    font-size: 0.8125rem;
    padding: var(--space-1) var(--space-2);
    border: 1px solid var(--color-border-strong);
    border-radius: var(--radius-sm);
    background: var(--color-surface);
    color: var(--color-text);
    min-width: 0;
  }
  .field:focus {
    outline: 2px solid var(--color-teal);
    outline-offset: 0;
    border-color: var(--color-teal);
  }

  .field-first { flex: 2; min-width: 5rem; }
  .field-middle { flex: 1; min-width: 4rem; }
  .field-last { flex: 2; min-width: 5rem; }
  .field-suffix { width: 3.5rem; flex: 0 0 auto; }
  .field-character { flex: 2; min-width: 6rem; }
  .field-pronouns { width: 6rem; flex: 0 0 auto; }
  .field-email { flex: 2; min-width: 8rem; }
  .field-phone { width: 8rem; flex: 0 0 auto; }

  .row-actions {
    display: flex;
    align-items: center;
    gap: 2px;
    margin-left: auto;
    flex-shrink: 0;
  }

  .arrow-btn {
    width: 1.25rem;
    height: 1.25rem;
    padding: 0;
    border: 1px solid var(--color-border);
    background: var(--color-surface);
    border-radius: var(--radius-sm);
    font-size: 0.5rem;
    cursor: pointer;
    color: var(--color-text-muted);
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  .arrow-btn:hover:not(:disabled) {
    color: var(--color-plum);
    border-color: var(--color-plum);
  }
  .arrow-btn:disabled {
    opacity: 0.3;

  }

  .delete-btn {
    width: 1.25rem;
    height: 1.25rem;
    padding: 0;
    border: 1px solid transparent;
    background: transparent;
    border-radius: var(--radius-sm);
    font-size: 0.875rem;
    cursor: pointer;
    color: var(--color-text-subtle);
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  .delete-btn:hover {
    color: var(--color-danger);
    border-color: var(--color-danger);
  }

  .conflict-btn {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    padding: var(--space-1) var(--space-2);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: var(--color-surface);
    font-size: 0.75rem;
    cursor: pointer;
    color: var(--color-text-muted);
    flex-shrink: 0;
  }
  .conflict-btn:hover {
    border-color: var(--color-plum);
    color: var(--color-text);
  }

  .conflict-count {
    font-weight: 700;
    color: var(--color-warning);
  }

  .modal-footer {
    display: flex;
    justify-content: flex-end;
    padding: var(--space-3) var(--space-5);
    border-top: 1px solid var(--color-border);
    background: var(--color-bg-alt);
  }

  .confirm-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(45, 31, 61, 0.4);
    z-index: 130;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .confirm-modal {
    background: var(--color-surface);
    border-radius: var(--radius-lg);
    padding: var(--space-5);
    max-width: 400px;
    width: 100%;
    box-shadow: var(--shadow-lg);
  }

  .confirm-modal h3 {
    margin: 0 0 var(--space-3) 0;
    color: var(--color-plum);
  }

  .confirm-modal p {
    color: var(--color-text-muted);
    font-size: 0.875rem;
    margin: 0 0 var(--space-4) 0;
  }

  .confirm-actions {
    display: flex;
    gap: var(--space-2);
    justify-content: flex-end;
  }

  :global(.btn-danger) {
    background: var(--color-danger);
    color: var(--color-text-inverse);
    border: none;
  }
  :global(.btn-danger:hover) {
    background: #b91c1c;
  }

  @media (max-width: 700px) {
    .modal {
      width: 100vw;
      max-width: none;
      border-radius: 0;
    }
    .actor-row-top,
    .actor-row-bottom {
      flex-wrap: wrap;
    }
    .field {
      flex: 1 1 40%;
      min-width: 0;
    }
    .field-middle,
    .field-suffix {
      flex: 0 0 auto;
    }
  }
</style>
