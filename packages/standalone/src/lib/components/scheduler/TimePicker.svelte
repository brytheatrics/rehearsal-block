<script lang="ts">
  /**
   * Replacement for `<input type="time">`.
   *
   * Why not native: browsers only open the picker when you click the tiny
   * clock icon on the right, scroll-wheel increments stutter on each
   * segment, and the 24-hour display clashes with the 12-hour labels we
   * use everywhere else in the scheduler. This component is a plain
   * button showing the current time in 12-hour format; clicking anywhere
   * on it opens a scrollable list of fixed increments. Keyboard arrows
   * navigate, Enter selects, Escape closes, clicking outside closes.
   *
   * Controlled: receives `value` as "HH:MM" (24h) and emits "HH:MM" on
   * change. Storage format never changes - only the rendering.
   */

  interface Props {
    value: string; // "HH:MM" (24-hour). Empty string renders as "-".
    disabled?: boolean;
    /** Grid step in minutes. 15 = every :00/:15/:30/:45. */
    minuteStep?: number;
    onchange: (next: string) => void;
    ariaLabel?: string;
    /** Compact variant used in tight rows (smaller padding). */
    compact?: boolean;
    /** Show a "Clear" option at the top so the user can unset the time
     *  back to blank (e.g. open-ended rehearsals with no end time). */
    clearable?: boolean;
    /** "HH:MM" floor - options before this time are hidden. Used for end
     *  time pickers so the director can only pick times at or after the
     *  start time. */
    minTime?: string;
    /** "HH:MM" ceiling - options after this time are hidden. Used for
     *  dress/perf call pickers so calls can't be after curtain. */
    maxTime?: string;
    /** "12h" or "24h" display. Defaults to "12h". */
    timeFormat?: "12h" | "24h";
  }

  const {
    value,
    disabled = false,
    minuteStep = 15,
    onchange,
    ariaLabel,
    compact = false,
    clearable = false,
    minTime,
    maxTime,
    timeFormat = "12h",
  }: Props = $props();

  let open = $state(false);
  let buttonEl = $state<HTMLButtonElement | null>(null);
  let listEl = $state<HTMLUListElement | null>(null);
  let highlighted = $state(-1);

  function toMins(hhmm: string): number {
    const [h, m] = hhmm.split(":").map(Number);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
    return (h as number) * 60 + (m as number);
  }

  const options = $derived.by<string[]>(() => {
    const stepsPerDay = Math.floor((24 * 60) / minuteStep);
    const all = Array.from({ length: stepsPerDay }, (_, i) => {
      const mins = i * minuteStep;
      const h = Math.floor(mins / 60);
      const m = mins % 60;
      return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    });
    let filtered = all;
    if (minTime) {
      const floor = toMins(minTime);
      filtered = filtered.filter((opt) => toMins(opt) >= floor);
    }
    if (maxTime) {
      const ceiling = toMins(maxTime);
      filtered = filtered.filter((opt) => toMins(opt) <= ceiling);
    }
    return filtered;
  });

  function fmt(hhmm: string): string {
    if (!hhmm) return "-";
    if (timeFormat === "24h") {
      const [h, m] = hhmm.split(":");
      if (h === undefined || m === undefined) return hhmm;
      return `${h.padStart(2, "0")}:${m.padStart(2, "0")}`;
    }
    const [hStr, mStr] = hhmm.split(":");
    const h = Number(hStr);
    const m = Number(mStr);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return hhmm;
    const period = h >= 12 ? "PM" : "AM";
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return `${h12}:${String(m).padStart(2, "0")} ${period}`;
  }

  const displayValue = $derived(fmt(value));

  /** Index of the option closest to the current value, for initial highlight + scroll. */
  function nearestIndex(): number {
    if (!value) return 0;
    const idx = options.indexOf(value);
    if (idx >= 0) return idx;
    // Not on the grid - find closest.
    const [h, m] = value.split(":").map(Number);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
    const target = (h as number) * 60 + (m as number);
    let best = 0;
    let bestDelta = Number.POSITIVE_INFINITY;
    options.forEach((opt, i) => {
      const [oh, om] = opt.split(":").map(Number);
      const t = (oh as number) * 60 + (om as number);
      const d = Math.abs(t - target);
      if (d < bestDelta) {
        bestDelta = d;
        best = i;
      }
    });
    return best;
  }

  function openDropdown() {
    if (disabled) return;
    open = true;
    highlighted = nearestIndex();
    // Scroll highlighted option into view after the list mounts.
    queueMicrotask(() => {
      if (!listEl) return;
      const el = listEl.querySelector<HTMLLIElement>(
        `[data-index="${highlighted}"]`,
      );
      el?.scrollIntoView({ block: "center" });
    });
  }

  function closeDropdown() {
    open = false;
    highlighted = -1;
  }

  function select(opt: string) {
    onchange(opt);
    closeDropdown();
    buttonEl?.focus();
  }

  function onButtonKey(e: KeyboardEvent) {
    if (disabled) return;
    if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
      e.preventDefault();
      openDropdown();
    }
  }

  function onListKey(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      closeDropdown();
      buttonEl?.focus();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      highlighted = Math.min(options.length - 1, highlighted + 1);
      scrollHighlightedIntoView();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      highlighted = Math.max(0, highlighted - 1);
      scrollHighlightedIntoView();
    } else if (e.key === "Enter") {
      e.preventDefault();
      const opt = options[highlighted];
      if (opt) select(opt);
    } else if (e.key === "Tab") {
      closeDropdown();
    }
  }

  function scrollHighlightedIntoView() {
    if (!listEl) return;
    const el = listEl.querySelector<HTMLLIElement>(
      `[data-index="${highlighted}"]`,
    );
    el?.scrollIntoView({ block: "nearest" });
  }

  /**
   * Close when focus leaves the picker entirely. Use a small timeout so a
   * click on an option isn't lost to a blur fired before the click.
   */
  function onRootFocusOut(e: FocusEvent) {
    const next = e.relatedTarget as Node | null;
    const root = (e.currentTarget as HTMLElement) ?? null;
    if (!root) return;
    if (next && root.contains(next)) return;
    closeDropdown();
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="picker" onfocusout={onRootFocusOut}>
  <button
    bind:this={buttonEl}
    type="button"
    class="trigger"
    class:compact
    class:open
    class:empty={!value}
    {disabled}
    aria-haspopup="listbox"
    aria-expanded={open}
    aria-label={ariaLabel}
    onclick={() => (open ? closeDropdown() : openDropdown())}
    onkeydown={onButtonKey}
  >
    <span class="value">{displayValue}</span>
    <span class="chev" aria-hidden="true">▾</span>
  </button>

  {#if open}
    <ul
      bind:this={listEl}
      class="list"
      role="listbox"
      tabindex="-1"
      onkeydown={onListKey}
    >
      {#if clearable}
        <li
          role="option"
          aria-selected={!value}
          class="option clear-option"
          class:highlighted={highlighted === -1}
        >
          <button
            type="button"
            class="option-btn clear-btn"
            tabindex={highlighted === -1 ? 0 : -1}
            onclick={() => select("")}
            onmouseenter={() => (highlighted = -1)}
          >
            - Clear -
          </button>
        </li>
      {/if}
      {#each options as opt, i (opt)}
        <li
          data-index={i}
          role="option"
          aria-selected={opt === value}
          class="option"
          class:selected={opt === value}
          class:highlighted={i === highlighted}
        >
          <button
            type="button"
            class="option-btn"
            tabindex={i === highlighted ? 0 : -1}
            onclick={() => select(opt)}
            onmouseenter={() => (highlighted = i)}
          >
            {fmt(opt)}
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .picker {
    position: relative;
    display: inline-flex;
  }

  .trigger {
    display: inline-flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    font: inherit;
    font-size: 0.8125rem;
    font-weight: 600;
    padding: var(--space-2) var(--space-3);
    min-width: 9rem;
    background: var(--color-surface);
    border: 1px solid var(--color-border-strong);
    border-radius: var(--radius-sm);
    color: var(--color-text);
    cursor: pointer;
    transition:
      border-color var(--transition-fast),
      box-shadow var(--transition-fast);
  }

  .trigger.compact {
    padding: var(--space-1) var(--space-2);
    min-width: 7rem;
    font-size: 0.75rem;
  }

  .trigger.empty .value {
    color: var(--color-text-subtle);
    font-weight: 500;
  }

  .trigger:hover:not(:disabled) {
    border-color: var(--color-teal);
  }

  .trigger:focus-visible {
    outline: 2px solid var(--color-teal);
    outline-offset: 0;
    border-color: var(--color-teal);
  }

  .trigger.open {
    border-color: var(--color-plum);
    box-shadow: 0 0 0 2px rgba(45, 31, 61, 0.15);
  }

  .trigger:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .chev {
    color: var(--color-text-subtle);
    font-size: 0.625rem;
    line-height: 1;
  }

  .list {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    z-index: 80;
    list-style: none;
    margin: 0;
    padding: var(--space-1);
    min-width: 100%;
    max-height: 260px;
    overflow-y: auto;
    overscroll-behavior: contain;
    background: var(--color-surface);
    border: 1px solid var(--color-border-strong);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-lg);
  }

  .option {
    padding: 0;
    margin: 0;
  }

  .option-btn {
    display: block;
    width: 100%;
    text-align: left;
    font: inherit;
    font-size: 0.8125rem;
    padding: var(--space-2) var(--space-3);
    background: transparent;
    border: none;
    border-radius: var(--radius-sm);
    color: var(--color-text);
    cursor: pointer;
    white-space: nowrap;
  }

  .option.highlighted .option-btn {
    background: var(--color-bg-alt);
  }

  .option.selected .option-btn {
    color: var(--color-plum);
    font-weight: 700;
  }

  .option.selected.highlighted .option-btn {
    background: var(--color-plum);
    color: var(--color-text-inverse);
  }

  .clear-btn {
    color: var(--color-text-subtle);
    font-style: italic;
  }
</style>
