<script lang="ts">
  import type { Conflict, ScheduleDoc } from "@rehearsal-block/core";
  import { formatUsDate } from "@rehearsal-block/core";
  import { onMount } from "svelte";

  interface Props {
    show: ScheduleDoc;
    onclose: () => void;
    /** Called when the director accepts a pending submission. Merges the
     *  submitted conflicts into doc.conflicts. */
    onacceptconflicts?: (conflicts: Conflict[]) => void;
    /** Called when the director changes the conflict lockout date or
     *  toggle. Undefined means "no lockout, edits always allowed". */
    onchangelockout?: (lockoutDate: string | undefined) => void;
    /** When true, the "One per role" link mode is locked behind the
     *  paywall - selecting the tab or copying a per-role link opens the
     *  paywall modal. Single link mode stays usable. */
    perRoleLocked?: boolean;
    /** Called when a locked interaction is attempted. */
    onpaywall?: () => void;
  }

  const {
    show,
    onclose,
    onacceptconflicts,
    onchangelockout,
    perRoleLocked = false,
    onpaywall,
  }: Props = $props();

  type LinkMode = "single" | "per-actor";
  type Tab = "generate" | "pending";

  type Submission = {
    id: string;
    actorId: string;
    actorName: string;
    conflicts: Conflict[];
    submittedAt: string;
  };

  let tab = $state<Tab>("generate");
  let linkMode = $state<LinkMode>("single");
  let copied = $state<string | null>(null);
  let allCopied = $state(false);

  // ---- Lockout date (deadline for actor edits) ----
  // Derived from show.settings.conflictLockoutDate, but we maintain local
  // editable state so toggling off/on doesn't immediately commit.
  function todayPlusDays(days: number): string {
    const d = new Date();
    d.setDate(d.getDate() + days);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  let lockoutEnabled = $state<boolean>(!!show.settings.conflictLockoutDate);
  let lockoutDate = $state<string>(
    show.settings.conflictLockoutDate ?? todayPlusDays(7),
  );

  // Sync local state with incoming show prop changes (e.g. when loading)
  $effect(() => {
    const incoming = show.settings.conflictLockoutDate;
    lockoutEnabled = !!incoming;
    if (incoming) lockoutDate = incoming;
  });

  function toggleLockout() {
    lockoutEnabled = !lockoutEnabled;
    if (lockoutEnabled) {
      // If no date set yet, default to a week out
      if (!lockoutDate) lockoutDate = todayPlusDays(7);
      onchangelockout?.(lockoutDate);
    } else {
      onchangelockout?.(undefined);
    }
  }

  function updateLockoutDate(newDate: string) {
    lockoutDate = newDate;
    if (lockoutEnabled && newDate) {
      onchangelockout?.(newDate);
    }
  }

  // Deterministic placeholder token hashed from show name + start date.
  // In Priority 2 production, this becomes a real conflict_share_token on
  // the shows table (uniquely generated, stored in Supabase).
  const baseUrl = $derived.by(() => {
    if (typeof window === "undefined") return "https://rehearsalblock.com";
    return window.location.origin;
  });

  function hashString(s: string): string {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return Math.abs(h).toString(36).padStart(6, "0").slice(0, 8);
  }

  const showToken = $derived(hashString(show.show.name + show.show.startDate));

  const singleLink = $derived(`${baseUrl}/conflicts/${showToken}`);

  // Per-role links include both cast and crew. Each gets a unique URL
  // tied to their member id. Grouped visually in the UI below.
  const perActorCastLinks = $derived(
    show.cast.map((m) => ({
      id: m.id,
      name: `${m.firstName} ${m.lastName}`.trim(),
      subtitle: m.character || "",
      url: `${baseUrl}/conflicts/${showToken}/${m.id.slice(0, 6)}`,
    })),
  );
  const perActorCrewLinks = $derived(
    show.crew.map((m) => ({
      id: m.id,
      name: `${m.firstName} ${m.lastName}`.trim(),
      subtitle: m.role || "",
      url: `${baseUrl}/conflicts/${showToken}/${m.id.slice(0, 6)}`,
    })),
  );
  const totalRoleLinks = $derived(
    perActorCastLinks.length + perActorCrewLinks.length,
  );

  // ---- localStorage snapshot (so actor-facing page can find the show) ----
  // In production this comes from Supabase via the conflict_share_token.
  // For local testing, we write the current show state to localStorage
  // whenever the modal is open so the /conflicts routes can read it.
  const SHOW_KEY = $derived(`rehearsal-block:conflict-show:${showToken}`);
  const SUBMISSIONS_KEY = $derived(`rehearsal-block:conflict-submissions:${showToken}`);

  $effect(() => {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(SHOW_KEY, JSON.stringify(show));
    } catch {
      // QuotaExceeded or similar - ignore, the worst case is the link
      // won't work locally, which the actor page handles with an error.
    }
  });

  // ---- Pending submissions (read from localStorage) ----
  let pendingSubmissions = $state<Submission[]>([]);

  function readSubmissions(): Submission[] {
    if (typeof window === "undefined") return [];
    try {
      const raw = localStorage.getItem(SUBMISSIONS_KEY);
      if (!raw) return [];
      return JSON.parse(raw) as Submission[];
    } catch {
      return [];
    }
  }

  function writeSubmissions(subs: Submission[]) {
    if (typeof window === "undefined") return;
    localStorage.setItem(SUBMISSIONS_KEY, JSON.stringify(subs));
    pendingSubmissions = subs;
  }

  function refreshSubmissions() {
    pendingSubmissions = readSubmissions();
  }

  onMount(() => {
    refreshSubmissions();
    // Listen for submissions coming in from other tabs (actor-facing page)
    const handler = (e: StorageEvent) => {
      if (e.key === SUBMISSIONS_KEY) refreshSubmissions();
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  });

  // ---- Accept / Reject ----

  function acceptSubmission(sub: Submission) {
    onacceptconflicts?.(sub.conflicts);
    // Remove from localStorage (inbox pattern, not archive)
    const remaining = readSubmissions().filter((s) => s.id !== sub.id);
    writeSubmissions(remaining);
    // Auto-switch tabs if inbox is now empty
    if (remaining.length === 0) tab = "generate";
  }

  function rejectSubmission(sub: Submission) {
    const remaining = readSubmissions().filter((s) => s.id !== sub.id);
    writeSubmissions(remaining);
  }

  function formatSubmittedAt(iso: string): string {
    try {
      const d = new Date(iso);
      return d.toLocaleString([], { dateStyle: "short", timeStyle: "short" });
    } catch {
      return iso;
    }
  }

  async function copyToClipboard(text: string, key: string) {
    try {
      await navigator.clipboard.writeText(text);
      copied = key;
      setTimeout(() => {
        if (copied === key) copied = null;
      }, 1600);
    } catch {
      // fallback: do nothing for now
    }
  }

  /** Used for per-role copy buttons. Opens the paywall when locked
   *  instead of copying the link to the clipboard. */
  function copyPerActorLink(text: string, key: string) {
    if (perRoleLocked) {
      onpaywall?.();
      return;
    }
    copyToClipboard(text, key);
  }

  async function copyAllPerActor() {
    if (perRoleLocked) {
      onpaywall?.();
      return;
    }
    const parts: string[] = [];
    if (perActorCastLinks.length > 0) {
      parts.push("Cast:");
      parts.push(...perActorCastLinks.map((l) => `${l.name}: ${l.url}`));
    }
    if (perActorCrewLinks.length > 0) {
      if (parts.length > 0) parts.push("");
      parts.push("Production Team:");
      parts.push(...perActorCrewLinks.map((l) => `${l.name}: ${l.url}`));
    }
    const lines = parts.join("\n");
    try {
      await navigator.clipboard.writeText(lines);
      allCopied = true;
      setTimeout(() => (allCopied = false), 1600);
    } catch {
      // ignore
    }
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="backdrop" onclick={onclose}></div>

<div class="modal">
  <div class="modal-header">
    <h2>Collect Conflicts</h2>
    <button type="button" class="close-btn" aria-label="Close" onclick={onclose}>&times;</button>
  </div>

  <div class="tabs">
    <button
      type="button"
      class="tab"
      class:active={tab === "generate"}
      onclick={() => (tab = "generate")}
    >
      Generate Links
    </button>
    <button
      type="button"
      class="tab"
      class:active={tab === "pending"}
      onclick={() => (tab = "pending")}
    >
      Pending
      {#if pendingSubmissions.length > 0}
        <span class="badge">{pendingSubmissions.length}</span>
      {/if}
    </button>
  </div>

  <div class="modal-body">
    {#if tab === "generate"}
      <div class="section">
        <span class="section-label">Link type</span>
        <div class="toggle-row">
          <button
            type="button"
            class="toggle-pill"
            class:active={linkMode === "single"}
            onclick={() => (linkMode = "single")}
          >
            Single link
          </button>
          <button
            type="button"
            class="toggle-pill"
            class:active={linkMode === "per-actor"}
            onclick={() => (linkMode = "per-actor")}
          >
            One per role
            {#if perRoleLocked}
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" fill="currentColor" width="11" height="11" aria-hidden="true" class="lock-icon"><path d="M240-80q-33 0-56.5-23.5T160-160v-400q0-33 23.5-56.5T240-640h40v-80q0-83 58.5-141.5T480-920q83 0 141.5 58.5T680-720v80h40q33 0 56.5 23.5T800-560v400q0 33-23.5 56.5T720-80H240Zm240-200q33 0 56.5-23.5T560-360q0-33-23.5-56.5T480-440q-33 0-56.5 23.5T400-360q0 33 23.5 56.5T480-280ZM360-640h240v-80q0-50-35-85t-85-35q-50 0-85 35t-35 85v80Z"/></svg>
            {/if}
          </button>
        </div>
        <p class="hint">
          {#if linkMode === "single"}
            Share one link with the whole cast and production team. Each person picks their name from a dropdown, marks unavailable dates, and submits.
          {:else if perRoleLocked}
            Each person gets a unique link tied to their name. Per-role links are part of the paid version - unlock to copy them.
          {:else}
            Each person gets a unique link tied to their name. No dropdown needed, but you'll need to distribute {totalRoleLinks} link{totalRoleLinks === 1 ? "" : "s"}.
          {/if}
        </p>
      </div>

      <div class="section">
        <label class="lockout-toggle">
          <input
            type="checkbox"
            checked={lockoutEnabled}
            onchange={toggleLockout}
          />
          <span class="section-label lockout-label">Lock edits after a deadline</span>
        </label>
        {#if lockoutEnabled}
          <div class="lockout-row">
            <input
              type="date"
              class="lockout-date"
              value={lockoutDate}
              min={todayPlusDays(0)}
              onchange={(e) => updateLockoutDate((e.currentTarget as HTMLInputElement).value)}
            />
            <span class="lockout-preview">
              {lockoutDate ? `Actors can edit through ${formatUsDate(lockoutDate)}` : ""}
            </span>
          </div>
          <p class="hint">
            After this date, actors who open the link can only view their previously submitted conflicts. They can't add, edit, or remove.
          </p>
        {:else}
          <p class="hint">
            Actors can add or edit their conflicts forever. Turn on the deadline to lock edits after a specific date.
          </p>
        {/if}
      </div>

      {#if linkMode === "single"}
        <div class="section">
          <span class="section-label">Share this link</span>
          <div class="link-row">
            <input
              type="text"
              class="link-input"
              readonly
              value={singleLink}
              onclick={(e) => (e.currentTarget as HTMLInputElement).select()}
            />
            <button
              type="button"
              class="copy-btn"
              onclick={() => copyToClipboard(singleLink, "single")}
            >
              {copied === "single" ? "Copied!" : "Copy"}
            </button>
          </div>
        </div>
      {:else}
        <div class="section">
          <div class="per-actor-header">
            <span class="section-label">Per-role links ({totalRoleLinks})</span>
            <button
              type="button"
              class="copy-all-btn"
              class:locked={perRoleLocked}
              disabled={totalRoleLinks === 0}
              onclick={copyAllPerActor}
            >
              {#if perRoleLocked}
                Unlock to copy
              {:else}
                {allCopied ? "All copied!" : "Copy all"}
              {/if}
            </button>
          </div>
          {#if totalRoleLinks === 0}
            <p class="empty">No cast or crew yet. Add people in Settings &gt; Contacts.</p>
          {:else}
            <div class="per-actor-list">
              {#if perActorCastLinks.length > 0}
                <div class="per-actor-group-label">Cast</div>
                {#each perActorCastLinks as link (link.id)}
                  <div class="per-actor-row">
                    <div class="per-actor-info">
                      <span class="per-actor-name">{link.name}</span>
                      {#if link.subtitle}
                        <span class="per-actor-subtitle">{link.subtitle}</span>
                      {/if}
                    </div>
                    <button
                      type="button"
                      class="per-actor-copy"
                      class:locked={perRoleLocked}
                      onclick={() => copyPerActorLink(link.url, link.id)}
                    >
                      {#if perRoleLocked}
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" fill="currentColor" width="11" height="11" aria-hidden="true"><path d="M240-80q-33 0-56.5-23.5T160-160v-400q0-33 23.5-56.5T240-640h40v-80q0-83 58.5-141.5T480-920q83 0 141.5 58.5T680-720v80h40q33 0 56.5 23.5T800-560v400q0 33-23.5 56.5T720-80H240Zm240-200q33 0 56.5-23.5T560-360q0-33-23.5-56.5T480-440q-33 0-56.5 23.5T400-360q0 33 23.5 56.5T480-280ZM360-640h240v-80q0-50-35-85t-85-35q-50 0-85 35t-35 85v80Z"/></svg>
                        Unlock
                      {:else}
                        {copied === link.id ? "Copied!" : "Copy link"}
                      {/if}
                    </button>
                  </div>
                {/each}
              {/if}
              {#if perActorCrewLinks.length > 0}
                <div class="per-actor-group-label">Production Team</div>
                {#each perActorCrewLinks as link (link.id)}
                  <div class="per-actor-row">
                    <div class="per-actor-info">
                      <span class="per-actor-name">{link.name}</span>
                      {#if link.subtitle}
                        <span class="per-actor-subtitle">{link.subtitle}</span>
                      {/if}
                    </div>
                    <button
                      type="button"
                      class="per-actor-copy"
                      class:locked={perRoleLocked}
                      onclick={() => copyPerActorLink(link.url, link.id)}
                    >
                      {#if perRoleLocked}
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" fill="currentColor" width="11" height="11" aria-hidden="true"><path d="M240-80q-33 0-56.5-23.5T160-160v-400q0-33 23.5-56.5T240-640h40v-80q0-83 58.5-141.5T480-920q83 0 141.5 58.5T680-720v80h40q33 0 56.5 23.5T800-560v400q0 33-23.5 56.5T720-80H240Zm240-200q33 0 56.5-23.5T560-360q0-33-23.5-56.5T480-440q-33 0-56.5 23.5T400-360q0 33 23.5 56.5T480-280ZM360-640h240v-80q0-50-35-85t-85-35q-50 0-85 35t-35 85v80Z"/></svg>
                        Unlock
                      {:else}
                        {copied === link.id ? "Copied!" : "Copy link"}
                      {/if}
                    </button>
                  </div>
                {/each}
              {/if}
            </div>
          {/if}
        </div>
      {/if}

      <div class="demo-note">
        Demo mode - submissions stay on this device only. Open a link in a new tab to simulate an actor submitting conflicts.
      </div>
    {:else}
      {#if pendingSubmissions.length === 0}
        <div class="empty-state">
          <svg width="40" height="40" viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true">
            <path d="M160-200v-80h80v-280q0-83 50-147.5T420-792v-28q0-25 17.5-42.5T480-880q25 0 42.5 17.5T540-820v28q80 20 130 84.5T720-560v280h80v80H160Zm320-300Zm0 420q-33 0-56.5-23.5T400-160h160q0 33-23.5 56.5T480-80ZM320-280h320v-280q0-66-47-113t-113-47q-66 0-113 47t-47 113v280Z"/>
          </svg>
          <p class="empty-title">No submissions yet</p>
          <p class="empty-hint">Once actors submit their conflicts, they'll appear here for you to review and apply.</p>
        </div>
      {:else}
        <div class="pending-list">
          {#each pendingSubmissions as sub (sub.id)}
            <div class="pending-row">
              <div class="pending-info">
                <strong>{sub.actorName}</strong>
                <span class="pending-meta">{sub.conflicts.length} conflict{sub.conflicts.length === 1 ? "" : "s"} · {formatSubmittedAt(sub.submittedAt)}</span>
                <ul class="pending-dates">
                  {#each sub.conflicts as c (c.id)}
                    <li>
                      {formatUsDate(c.date)}
                      {#if c.startTime && c.endTime}
                        <span class="pending-time">({c.startTime} - {c.endTime})</span>
                      {:else}
                        <span class="pending-time">(full day)</span>
                      {/if}
                      {#if c.label}
                        <span class="pending-label">- {c.label}</span>
                      {/if}
                    </li>
                  {/each}
                </ul>
              </div>
              <div class="pending-actions">
                <button type="button" class="ghost-btn ghost-btn-accept" onclick={() => acceptSubmission(sub)}>Accept</button>
                <button type="button" class="ghost-btn ghost-btn-reject" onclick={() => rejectSubmission(sub)}>Reject</button>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    {/if}
  </div>

  <div class="modal-footer">
    <button type="button" class="cancel-btn" onclick={onclose}>Close</button>
  </div>
</div>

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
    width: 520px;
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
    align-items: center;
    justify-content: space-between;
    padding: var(--space-4) var(--space-5);
    border-bottom: 1px solid var(--color-border);
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
    font-size: 1.25rem;
    color: var(--color-text-muted);
    cursor: pointer;
    padding: 0;
    line-height: 1;
  }
  .close-btn:hover {
    color: var(--color-text);
  }

  .tabs {
    display: flex;
    gap: var(--space-1);
    padding: 0 var(--space-5);
    border-bottom: 1px solid var(--color-border);
  }
  .tab {
    font: inherit;
    font-size: 0.8125rem;
    font-weight: 600;
    padding: var(--space-3) var(--space-3);
    border: none;
    border-bottom: 2px solid transparent;
    background: transparent;
    color: var(--color-text-muted);
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    margin-bottom: -1px;
  }
  .tab:hover {
    color: var(--color-text);
  }
  .tab.active {
    color: var(--color-plum);
    border-bottom-color: var(--color-plum);
  }

  .badge {
    background: var(--color-teal);
    color: var(--color-text-inverse);
    font-size: 0.6875rem;
    font-weight: 700;
    padding: 1px var(--space-2);
    border-radius: var(--radius-full);
  }

  .modal-body {
    padding: var(--space-4) var(--space-5);
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    overflow-y: auto;
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

  .lockout-toggle {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    cursor: pointer;
  }
  .lockout-toggle input[type="checkbox"] {
    accent-color: var(--color-plum);
    cursor: pointer;
    width: 14px;
    height: 14px;
    margin: 0;
  }
  .lockout-label {
    cursor: pointer;
  }

  .lockout-row {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    flex-wrap: wrap;
  }

  .lockout-date {
    font: inherit;
    font-size: 0.8125rem;
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: var(--color-surface);
    color: var(--color-text);
    cursor: pointer;
  }
  .lockout-date:focus {
    outline: 2px solid var(--color-teal);
    outline-offset: 1px;
    border-color: var(--color-teal);
  }

  .lockout-preview {
    font-size: 0.75rem;
    color: var(--color-teal);
    font-weight: 600;
  }

  .toggle-row {
    display: flex;
    gap: var(--space-2);
    flex-wrap: wrap;
  }

  .toggle-pill {
    font: inherit;
    font-size: 0.75rem;
    font-weight: 600;
    padding: var(--space-1) var(--space-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-full);
    background: transparent;
    color: var(--color-text-muted);
    cursor: pointer;
    transition: all var(--transition-fast);
  }
  .toggle-pill:hover {
    border-color: var(--color-plum);
    color: var(--color-plum);
  }
  .toggle-pill.active {
    background: var(--color-plum);
    border-color: var(--color-plum);
    color: var(--color-text-inverse);
  }
  .toggle-pill .lock-icon {
    margin-left: 4px;
    opacity: 0.7;
    vertical-align: -1px;
  }

  .hint {
    font-size: 0.75rem;
    color: var(--color-text-muted);
    margin: 0;
    line-height: 1.4;
  }

  .link-row {
    display: flex;
    gap: var(--space-2);
  }

  .link-input {
    flex: 1;
    font: inherit;
    font-size: 0.8125rem;
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: var(--color-bg-alt);
    color: var(--color-text);
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  }

  .copy-btn {
    font: inherit;
    font-size: 0.8125rem;
    font-weight: 600;
    padding: var(--space-2) var(--space-4);
    border: none;
    border-radius: var(--radius-sm);
    background: var(--color-teal);
    color: var(--color-text-inverse);
    cursor: pointer;
    transition: background var(--transition-fast);
    min-width: 80px;
  }
  .copy-btn:hover {
    background: var(--color-teal-dark);
  }

  .per-actor-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .copy-all-btn {
    font: inherit;
    font-size: 0.75rem;
    font-weight: 600;
    padding: var(--space-1) var(--space-3);
    border: 1px solid var(--color-teal);
    border-radius: var(--radius-full);
    background: transparent;
    color: var(--color-teal);
    cursor: pointer;
  }
  .copy-all-btn:hover:not(:disabled) {
    background: var(--color-teal);
    color: var(--color-text-inverse);
  }
  .copy-all-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .per-actor-list {
    display: flex;
    flex-direction: column;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    max-height: 260px;
    overflow-y: auto;
  }

  .per-actor-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-2) var(--space-3);
    border-bottom: 1px solid var(--color-border);
  }
  .per-actor-row:last-child {
    border-bottom: none;
  }

  .per-actor-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .per-actor-name {
    font-size: 0.8125rem;
    color: var(--color-text);
  }

  .per-actor-subtitle {
    font-size: 0.6875rem;
    color: var(--color-text-muted);
  }

  .per-actor-group-label {
    font-size: 0.625rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--color-text-subtle);
    padding: var(--space-2) var(--space-3) var(--space-1);
    background: var(--color-bg-alt);
    border-bottom: 1px solid var(--color-border);
  }

  .per-actor-copy {
    font: inherit;
    font-size: 0.75rem;
    font-weight: 600;
    padding: var(--space-1) var(--space-2);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--color-text-muted);
    cursor: pointer;
  }
  .per-actor-copy:hover {
    border-color: var(--color-teal);
    color: var(--color-teal);
  }
  .per-actor-copy.locked {
    border-color: var(--color-plum);
    color: var(--color-plum);
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }
  .per-actor-copy.locked:hover {
    background: var(--color-plum);
    color: var(--color-text-inverse);
  }
  .copy-all-btn.locked {
    border-color: var(--color-plum);
    color: var(--color-plum);
  }
  .copy-all-btn.locked:hover {
    background: var(--color-plum);
    color: var(--color-text-inverse);
  }

  .empty {
    font-size: 0.8125rem;
    color: var(--color-text-muted);
    margin: 0;
  }

  .demo-note {
    font-size: 0.6875rem;
    color: var(--color-text-muted);
    background: var(--color-bg-alt);
    border-left: 3px solid var(--color-teal);
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-sm);
    line-height: 1.4;
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-6) var(--space-4);
    color: var(--color-text-muted);
    text-align: center;
  }
  .empty-state svg {
    opacity: 0.4;
  }
  .empty-title {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--color-text);
    margin: 0;
  }
  .empty-hint {
    font-size: 0.75rem;
    margin: 0;
    max-width: 320px;
    line-height: 1.4;
  }

  .pending-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .pending-row {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-3);
    padding: var(--space-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-surface);
  }

  .pending-info {
    flex: 1;
    min-width: 0;
  }

  .pending-info strong {
    color: var(--color-plum);
    font-size: 0.875rem;
  }

  .pending-meta {
    display: block;
    font-size: 0.6875rem;
    color: var(--color-text-muted);
    margin-top: 2px;
  }

  .pending-dates {
    list-style: none;
    padding: 0;
    margin: var(--space-2) 0 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
    max-height: 120px;
    overflow-y: auto;
  }

  .pending-dates li {
    font-size: 0.75rem;
    color: var(--color-text);
  }

  .pending-time {
    color: var(--color-text-muted);
  }

  .pending-label {
    color: var(--color-text-muted);
    font-style: italic;
  }

  .pending-actions {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    flex-shrink: 0;
  }

  .ghost-btn {
    font: inherit;
    font-size: 0.75rem;
    font-weight: 600;
    padding: var(--space-1) var(--space-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--color-text-muted);
    cursor: pointer;
  }
  .ghost-btn:hover {
    border-color: var(--color-plum);
    color: var(--color-plum);
  }

  .ghost-btn-accept {
    border-color: var(--color-teal);
    color: var(--color-teal);
  }
  .ghost-btn-accept:hover {
    background: var(--color-teal);
    border-color: var(--color-teal);
    color: var(--color-text-inverse);
  }

  .ghost-btn-reject:hover {
    border-color: var(--color-danger);
    color: var(--color-danger);
  }

  .modal-footer {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2);
    padding: var(--space-3) var(--space-5);
    border-top: 1px solid var(--color-border);
    background: var(--color-bg-alt);
  }

  .cancel-btn {
    font: inherit;
    font-size: 0.8125rem;
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--color-text-muted);
    cursor: pointer;
  }
  .cancel-btn:hover {
    color: var(--color-text);
    border-color: var(--color-text-muted);
  }
</style>
