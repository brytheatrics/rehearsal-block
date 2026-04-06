<script lang="ts">
  /**
   * Minimal rich-text editor for day notes.
   *
   * Replaces the earlier `<textarea>` approach, where HTML strings from
   * the sample data rendered as literal `<p>` markup. A `contenteditable`
   * div renders tags properly and lets directors apply basic formatting
   * (bold at minimum, via Ctrl/Cmd+B or the toolbar button).
   *
   * Design:
   * - Stores/emits HTML strings. The value prop is written into the
   *   editor's innerHTML once on mount, and again when the parent
   *   updates the value AND the editor is not currently focused (avoids
   *   caret jumps while typing).
   * - Paste is forced to plain text so users don't drag in styles from
   *   other apps.
   * - The editor intentionally doesn't try to sanitize HTML - the source
   *   is always local: sample data we ship, or the director's own typing
   *   inside this same contenteditable. We never render untrusted HTML
   *   from another user.
   */

  interface Props {
    value: string;
    placeholder?: string;
    oninput: (html: string) => void;
  }

  const { value, placeholder = "", oninput }: Props = $props();

  let editorEl = $state<HTMLDivElement | null>(null);
  let focused = $state(false);

  // Keep the editor's DOM in sync with `value` - but only when the editor
  // is NOT focused. Writing to innerHTML while the user is typing would
  // destroy the caret position.
  $effect(() => {
    if (!editorEl) return;
    const next = value ?? "";
    if (focused) return;
    if (editorEl.innerHTML !== next) {
      editorEl.innerHTML = next;
    }
  });

  function currentHtml(): string {
    if (!editorEl) return "";
    let html = editorEl.innerHTML;
    // Normalize common "empty" DOM states so the parent sees "" and can
    // hide the notes line / compute its own placeholder behavior.
    if (html === "<br>" || html === "<div><br></div>" || html === "<p></p>") {
      html = "";
    }
    return html;
  }

  function handleInput() {
    oninput(currentHtml());
  }

  function handleKey(e: KeyboardEvent) {
    // Ctrl/Cmd+B / Ctrl/Cmd+I toggles bold / italic. execCommand is
    // deprecated but remains the simplest cross-browser way to apply
    // inline formatting inside a contenteditable; there is no modern
    // replacement with equivalent behavior yet.
    if (!(e.ctrlKey || e.metaKey)) return;
    const key = e.key.toLowerCase();
    if (key === "b") {
      e.preventDefault();
      document.execCommand("bold");
      handleInput();
    } else if (key === "i") {
      e.preventDefault();
      document.execCommand("italic");
      handleInput();
    }
  }

  function handlePaste(e: ClipboardEvent) {
    e.preventDefault();
    const text = e.clipboardData?.getData("text/plain") ?? "";
    document.execCommand("insertText", false, text);
  }

  function toggleBold() {
    editorEl?.focus();
    document.execCommand("bold");
    handleInput();
  }

  function toggleItalic() {
    editorEl?.focus();
    document.execCommand("italic");
    handleInput();
  }

  /**
   * Apply one of three preset sizes to the current selection. Uses the
   * legacy `fontSize` execCommand which emits `<font size="N">` tags; it's
   * deprecated but consistently supported everywhere, and the generated
   * markup round-trips cleanly through innerHTML. The select resets to
   * "normal" after applying so the user can pick the same size again.
   */
  function setFontSize(e: Event) {
    const sel = e.currentTarget as HTMLSelectElement;
    const value = sel.value;
    if (!value) return;
    editorEl?.focus();
    document.execCommand("fontSize", false, value);
    handleInput();
    sel.value = "";
  }

  const isEmpty = $derived(!value || value.replace(/<[^>]*>/g, "").trim() === "");
</script>

<div class="rt-wrap" class:focused>
  <div class="rt-toolbar">
    <button
      type="button"
      class="tool-btn"
      title="Bold (Ctrl+B)"
      aria-label="Bold"
      onmousedown={(e) => e.preventDefault()}
      onclick={toggleBold}
    >
      <strong>B</strong>
    </button>
    <button
      type="button"
      class="tool-btn italic-btn"
      title="Italic (Ctrl+I)"
      aria-label="Italic"
      onmousedown={(e) => e.preventDefault()}
      onclick={toggleItalic}
    >
      <em>I</em>
    </button>
    <span class="tool-divider" aria-hidden="true"></span>
    <!-- Size picker. Default option is blank ("choose") and resets after
         each use so the user can apply the same size repeatedly without
         an explicit reset gesture. -->
    <select
      class="size-select"
      aria-label="Text size"
      title="Text size"
      onmousedown={(e) => e.stopPropagation()}
      onchange={setFontSize}
    >
      <option value="">Size</option>
      <option value="2">Small</option>
      <option value="3">Normal</option>
      <option value="5">Large</option>
      <option value="7">Huge</option>
    </select>
  </div>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    bind:this={editorEl}
    class="rt-editor"
    class:empty={isEmpty}
    contenteditable="true"
    role="textbox"
    aria-multiline="true"
    tabindex="0"
    data-placeholder={placeholder}
    oninput={handleInput}
    onkeydown={handleKey}
    onpaste={handlePaste}
    onfocus={() => (focused = true)}
    onblur={() => (focused = false)}
  ></div>
</div>

<style>
  .rt-wrap {
    display: flex;
    flex-direction: column;
    border: 1px solid var(--color-border-strong);
    border-radius: var(--radius-sm);
    background: var(--color-surface);
    overflow: hidden;
    transition: border-color var(--transition-fast);
  }

  .rt-wrap.focused {
    border-color: var(--color-teal);
    box-shadow: 0 0 0 1px var(--color-teal);
  }

  .rt-toolbar {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    padding: var(--space-1) var(--space-2);
    border-bottom: 1px solid var(--color-border);
    background: var(--color-bg-alt);
  }

  .tool-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 1.75rem;
    height: 1.5rem;
    padding: 0 var(--space-2);
    background: transparent;
    border: 1px solid transparent;
    border-radius: var(--radius-sm);
    font: inherit;
    font-size: 0.8125rem;
    color: var(--color-text-muted);
    cursor: pointer;
  }
  .tool-btn:hover {
    background: var(--color-surface);
    border-color: var(--color-border-strong);
    color: var(--color-text);
  }
  .tool-btn:active {
    background: var(--color-bg);
  }
  .italic-btn em {
    font-style: italic;
  }

  .tool-divider {
    width: 1px;
    height: 1rem;
    background: var(--color-border);
    margin: 0 var(--space-1);
  }

  .size-select {
    font: inherit;
    font-size: 0.75rem;
    height: 1.5rem;
    padding: 0 var(--space-1);
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    color: var(--color-text-muted);
    cursor: pointer;
  }
  .size-select:hover {
    border-color: var(--color-border-strong);
    color: var(--color-text);
  }
  .size-select:focus-visible {
    outline: 2px solid var(--color-teal);
    outline-offset: 0;
  }

  .rt-editor {
    font: inherit;
    padding: var(--space-2) var(--space-3);
    min-height: 5rem;
    line-height: 1.5;
    color: var(--color-text);
    outline: none;
  }

  .rt-editor:focus {
    outline: none;
  }

  .rt-editor.empty::before {
    content: attr(data-placeholder);
    color: var(--color-text-subtle);
    pointer-events: none;
    position: absolute;
  }

  /* Tighten spacing on any stray block elements coming from pasted
     content or the contenteditable's own paragraph wrapping. */
  :global(.rt-editor p) {
    margin: 0 0 var(--space-2) 0;
  }
  :global(.rt-editor p:last-child) {
    margin-bottom: 0;
  }
  :global(.rt-editor strong) {
    font-weight: 700;
  }
</style>
