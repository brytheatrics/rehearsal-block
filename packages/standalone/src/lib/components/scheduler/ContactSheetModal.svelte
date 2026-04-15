<script lang="ts">
  import type { ScheduleDoc } from "@rehearsal-block/core";
  import { downloadContactSheetCsv } from "@rehearsal-block/core";
  import { downloadContactSheetDocx } from "$lib/export-docx.js";
  import { page } from "$app/state";

  const isBeta = $derived.by(() => {
    const p = (page.data as { profile?: { has_paid?: boolean; has_beta_access?: boolean } }).profile;
    return !!p?.has_beta_access && !p?.has_paid && !!(page.data as { betaActive?: boolean }).betaActive;
  });

  interface Props {
    show: ScheduleDoc;
    onclose: () => void;
    readOnly?: boolean;
    onpaywall?: () => void;
  }

  const { show, onclose, readOnly = false, onpaywall }: Props = $props();

  let includeCast = $state(true);
  let includeCrew = $state(true);
  type Format = "csv" | "docx" | "pdf";
  let format = $state<Format>("csv");
  let exporting = $state(false);

  const canExport = $derived(includeCast || includeCrew);

  async function doExport() {
    if (!canExport) return;
    if (readOnly) {
      onpaywall?.();
      return;
    }

    const opts = { includeCast, includeCrew };
    const betaFlag = isBeta;
    exporting = true;

    try {
      if (format === "csv") {
        downloadContactSheetCsv(show, { ...opts, beta: betaFlag });
      } else if (format === "docx") {
        await downloadContactSheetDocx(show, opts);
      } else if (format === "pdf") {
        const filename = (show.show.name || "Show").replace(/\s+/g, "_") + "_Contact_Sheet.pdf";
        const res = await fetch("/api/contact-sheet-pdf", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            doc: show,
            includeCast: opts.includeCast,
            includeCrew: opts.includeCrew,
            filename,
            beta: betaFlag,
          }),
        });
        if (!res.ok) throw new Error("PDF generation failed");
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } finally {
      exporting = false;
    }
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="backdrop" onclick={onclose}></div>

<div class="modal">
  <div class="modal-header">
    <h2>Export Contact Sheet</h2>
    <button type="button" class="close-btn" aria-label="Close" onclick={onclose}>&times;</button>
  </div>

  <div class="modal-body">
    <div class="section">
      <span class="section-label">Include</span>
      <div class="toggle-row">
        <button
          type="button"
          class="toggle-pill"
          class:active={includeCast}
          onclick={() => (includeCast = !includeCast)}
        >
          Cast ({show.cast.length})
        </button>
        <button
          type="button"
          class="toggle-pill"
          class:active={includeCrew}
          onclick={() => (includeCrew = !includeCrew)}
        >
          Production Team ({show.crew.length})
        </button>
      </div>
      {#if !canExport}
        <p class="warn">Select at least one group to export.</p>
      {/if}
    </div>

    <div class="section">
      <span class="section-label">Format</span>
      <div class="toggle-row">
        <button
          type="button"
          class="toggle-pill"
          class:active={format === "csv"}
          onclick={() => (format = "csv")}
        >
          CSV
        </button>
        <button
          type="button"
          class="toggle-pill"
          class:active={format === "docx"}
          onclick={() => (format = "docx")}
        >
          Word (.docx)
        </button>
        <button
          type="button"
          class="toggle-pill"
          class:active={format === "pdf"}
          onclick={() => (format = "pdf")}
        >
          PDF
        </button>
      </div>
      <p class="format-hint">
        {#if format === "csv"}
          Opens in Excel, Google Sheets, or any spreadsheet app.
        {:else if format === "docx"}
          Editable in Google Docs, Microsoft Word, or LibreOffice.
        {:else}
          Fixed layout, not editable. Best for printing.
        {/if}
      </p>
    </div>
  </div>

  <div class="modal-footer">
    <button type="button" class="cancel-btn" onclick={onclose}>Cancel</button>
    <button
      type="button"
      class="export-btn"
      disabled={!canExport || exporting}
      onclick={doExport}
    >
      {exporting ? "Exporting..." : "Export"}
    </button>
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
    width: 420px;
    max-width: calc(100vw - 2 * var(--space-4));
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

  .modal-body {
    padding: var(--space-4) var(--space-5);
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
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

  .warn {
    font-size: 0.75rem;
    color: var(--color-danger);
    margin: 0;
  }

  .format-hint {
    font-size: 0.6875rem;
    color: var(--color-text-muted);
    margin: 0;
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

  .export-btn {
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
  .export-btn:hover {
    background: var(--color-plum-light);
  }
  .export-btn:disabled {
    opacity: 0.4;

  }
</style>
