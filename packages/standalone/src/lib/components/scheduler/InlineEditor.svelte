<script lang="ts">
  /**
   * Inline editor for quick edits within calendar cells or list rows.
   * Renders input fields that replace static content when double-clicked.
   * Supports description, time (via TimePicker), and notes (plain text).
   */
  import type { Call, ScheduleDoc } from "@rehearsal-block/core";
  import TimePicker from "./TimePicker.svelte";

  type InlineField = "description" | "time" | "endTime" | "notes";

  interface Props {
    field: InlineField;
    value: string;
    show: ScheduleDoc;
    /** For time fields: floor constraint (end time must be >= start). */
    minTime?: string;
    /** For time fields: ceiling constraint (dress/perf <= curtain). */
    maxTime?: string;
    onchange: (value: string) => void;
    oncommit: () => void;
    oncancel: () => void;
    /** Move to the next inline field. */
    onnextfield?: () => void;
    /** Whether this is the currently active field (controls auto-open for TimePicker). Defaults to true. */
    active?: boolean;
  }

  const {
    field,
    value,
    show,
    minTime,
    maxTime,
    onchange,
    oncommit,
    oncancel,
    onnextfield,
    active = true,
  }: Props = $props();

  // Local state for text fields - prevents parent reactivity from
  // overwriting what the user is typing (e.g. clearing a call description
  // causes effectiveDescription to fall back to the day-level default).
  let localValue = $state(
    field === "notes"
      ? value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()
      : value,
  );

  const timeFmt = $derived(show.settings.timeFormat ?? "12h");
  const minuteStep = $derived(show.settings.timeIncrementMinutes ?? 15);

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      oncommit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      oncancel();
    } else if (e.key === "Tab" && onnextfield) {
      e.preventDefault();
      onnextfield();
    }
  }

  function autofocus(node: HTMLElement) {
    if (!active) return;
    queueMicrotask(() => {
      node.focus();
      // Place cursor at end. Don't select-all - the user double-clicked to
      // start editing, not to replace. They can Ctrl+A if they want.
      if (node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement) {
        const len = node.value.length;
        node.setSelectionRange(len, len);
      }
    });
  }
</script>

{#if field === "time" || field === "endTime"}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="inline-time" onclick={(e) => e.stopPropagation()} ondblclick={(e) => e.stopPropagation()}>
    <TimePicker
      {value}
      compact
      timeFormat={timeFmt}
      {minuteStep}
      {minTime}
      {maxTime}
      clearable={field === "endTime"}
      onchange={(next) => {
        onchange(next);
        if (field === "time" && onnextfield) {
          onnextfield();
        } else {
          oncommit();
        }
      }}
    />
  </div>
{:else if field === "notes"}
  <!-- svelte-ignore a11y_autofocus -->
  <textarea
    class="inline-notes"
    value={localValue}
    oninput={(e) => { localValue = e.currentTarget.value; onchange(localValue); }}
    onkeydown={(e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        oncancel();
      }
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        oncommit();
      }
    }}
    onclick={(e) => e.stopPropagation()}
    ondblclick={(e) => e.stopPropagation()}
    use:autofocus
    rows={1}
  ></textarea>
{:else}
  <!-- description -->
  <!-- svelte-ignore a11y_autofocus -->
  <input
    class="inline-desc"
    type="text"
    value={localValue}
    oninput={(e) => { localValue = e.currentTarget.value; onchange(localValue); }}
    onkeydown={handleKeydown}
    onclick={(e) => e.stopPropagation()}
    ondblclick={(e) => e.stopPropagation()}
    use:autofocus
  />
{/if}

<style>
  .inline-desc {
    font: inherit;
    font-size: inherit;
    line-height: inherit;
    width: 100%;
    padding: 0;
    margin: 0;
    border: none;
    border-bottom: 1px solid var(--color-teal);
    border-radius: 0;
    background: transparent;
    color: inherit;
    outline: none;
  }

  .inline-notes {
    font: inherit;
    font-size: inherit;
    font-style: italic;
    line-height: inherit;
    width: 100%;
    padding: 0;
    margin: 0;
    border: none;
    border-bottom: 1px solid var(--color-teal);
    border-radius: 0;
    background: transparent;
    color: inherit;
    outline: none;
    resize: none;
    overflow: hidden;
    field-sizing: content;
  }

  .inline-time {
    display: inline-flex;
  }
</style>
