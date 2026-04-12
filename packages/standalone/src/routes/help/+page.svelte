<svelte:head>
  <title>Help - Rehearsal Block</title>
  <meta name="description" content="Documentation and support for Rehearsal Block." />
</svelte:head>

<div class="help-page container-sm">
  <div class="construction-banner" role="note">
    <strong>Full help docs are on the way.</strong> This page will grow
    into a complete reference (getting started, feature guide, keyboard
    shortcuts, FAQ). Until then, the fastest way to learn Rehearsal
    Block is the interactive demo.
  </div>

  <h1>Help</h1>

  <h2>Try the demo</h2>

  <p>
    The <a href="/demo">demo page</a> loads a real sample show
    (<em>Romeo and Juliet</em>) with cast, production team, locations,
    and a few weeks of rehearsals already built out. Browse every view,
    open the day editor, switch scope between All / Month / Week / Day,
    open Settings, try the filter - get a feel for how the interface
    fits together. Most editing actions (creating shows, adding cast,
    saving, downloading, sharing) are paid features; the demo is for
    exploring how the app works before buying, not building your own
    schedule in it.
  </p>

  <h2>Key concepts</h2>

  <ul>
    <li><strong>Shows</strong> are containers for a production's schedule. One show per production.</li>
    <li><strong>Cast</strong> members are actors with characters. <strong>Production team</strong> members are stage managers, designers, and other behind-the-scenes roles. Both live in the sidebar (under a single Cast/Team toggle) and can be dragged onto days.</li>
    <li><strong>Groups</strong> let you call multiple cast at once (Ensemble, Leads, Dancers). "All Called" is a built-in group meaning everyone.</li>
    <li><strong>Event types</strong> are pill labels on days (Rehearsal, Tech, Dress, Performance). You configure the defaults in Settings.</li>
    <li><strong>Calls</strong> are the actual rehearsal blocks within a day. Most days have one call. Dress and performance days have multiple labeled calls (Crew Call, Actor Call, and so on).</li>
    <li><strong>Conflicts</strong> are dates or time windows when a cast member can't be at rehearsal. The grid shows them so you can plan around them.</li>
    <li><strong>Locations</strong> are rehearsal spaces with custom colors and shapes. Drag them onto days or specific calls.</li>
  </ul>

  <h2>Main toolbar</h2>

  <p>
    The toolbar at the top of the scheduler has 12 buttons in two groups:
    navigation / view controls on the left and actions on the right. At
    mobile width they wrap onto two rows (navigation on top, actions on
    bottom).
  </p>

  <h3>Navigation and view controls</h3>

  <ul class="toolbar-list">
    <li>
      <span class="toolbar-icons">
        <span class="toolbar-icon" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
            <rect x="1" y="3" width="14" height="12" rx="2" stroke="currentColor" stroke-width="1.5" fill="none"/>
            <line x1="1" y1="7" x2="15" y2="7" stroke="currentColor" stroke-width="1.5"/>
            <line x1="5.5" y1="3" x2="5.5" y2="15" stroke="currentColor" stroke-width="1"/>
            <line x1="10.5" y1="3" x2="10.5" y2="15" stroke="currentColor" stroke-width="1"/>
            <line x1="1" y1="11" x2="15" y2="11" stroke="currentColor" stroke-width="1"/>
            <line x1="4" y1="1" x2="4" y2="4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            <line x1="12" y1="1" x2="12" y2="4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
        </span>
        <span class="toolbar-icon-sep">/</span>
        <span class="toolbar-icon" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
            <line x1="5" y1="3" x2="14" y2="3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            <line x1="5" y1="8" x2="14" y2="8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            <line x1="5" y1="13" x2="14" y2="13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            <circle cx="2" cy="3" r="1.25" fill="currentColor"/>
            <circle cx="2" cy="8" r="1.25" fill="currentColor"/>
            <circle cx="2" cy="13" r="1.25" fill="currentColor"/>
          </svg>
        </span>
      </span>
      <strong>View toggle (Calendar / List)</strong> - switches between the calendar grid and the list view. The icon shows the mode you'll switch <em>to</em>, not the current mode.
    </li>
    <li>
      <span class="toolbar-icon" aria-hidden="true">
        <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
          <path d="M10 3L5 8l5 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </span>
      <strong>Previous</strong> - step backward one unit in the current scope (one month, one week, or one day). Disabled in Overview mode.
    </li>
    <li>
      <span class="toolbar-icon" aria-hidden="true">
        <svg width="18" height="18" viewBox="0 0 24 24">
          <path d="M8.6,11h-4.2c-.66,0-1.22-.18-1.7-.55s-.71-.81-.71-1.32v-3.27c0-.51.23-.95.71-1.32s1.04-.55,1.7-.55h4.2c.66,0,1.22.18,1.7.55s.71.81.71,1.32v3.27c0,.51-.23.95-.71,1.32s-1.04.55-1.7.55ZM4,9h5v-3H4v3Z" fill="currentColor"/>
          <path d="M19.6,20h-4.2c-.66,0-1.22-.18-1.7-.55s-.71-.81-.71-1.32v-3.27c0-.51.23-.95.71-1.32s1.04-.55,1.7-.55h4.2c.66,0,1.22.18,1.7.55s.71.81.71,1.32v3.27c0,.51-.23.95-.71,1.32s-1.04.55-1.7.55ZM15,18h5v-3h-5v3Z" fill="currentColor"/>
          <path d="M8.6,20h-4.2c-.66,0-1.22-.18-1.7-.55s-.71-.81-.71-1.32v-3.27c0-.51.23-.95.71-1.32s1.04-.55,1.7-.55h4.2c.66,0,1.22.18,1.7.55s.71.81.71,1.32v3.27c0,.51-.23.95-.71,1.32s-1.04.55-1.7.55ZM4,18h5v-3H4v3Z" fill="currentColor"/>
          <path d="M19.6,11h-4.2c-.66,0-1.22-.18-1.7-.55s-.71-.81-.71-1.32v-3.27c0-.51.23-.95.71-1.32s1.04-.55,1.7-.55h4.2c.66,0,1.22.18,1.7.55s.71.81.71,1.32v3.27c0,.51-.23.95-.71,1.32s-1.04.55-1.7.55ZM15,9h5v-3h-5v3Z" fill="currentColor"/>
        </svg>
      </span>
      <strong>View scope</strong> - opens a dropdown to pick Overview / Month / Week / Day. Controls how much of the schedule is visible at once. The button's icon changes based on the current scope. Keyboard: <kbd>Shift</kbd>+<kbd>A</kbd> / <kbd>M</kbd> / <kbd>W</kbd> / <kbd>D</kbd>.
    </li>
    <li>
      <span class="toolbar-icon" aria-hidden="true">
        <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
          <path d="M6 3l5 5-5 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </span>
      <strong>Next</strong> - step forward one unit in the current scope. Disabled in Overview mode.
    </li>
    <li>
      <span class="toolbar-icon" aria-hidden="true">
        <svg width="18" height="18" viewBox="0 0 14 14" fill="none">
          <line x1="1" y1="3.5" x2="13" y2="3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          <line x1="1" y1="7" x2="13" y2="7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          <line x1="1" y1="10.5" x2="13" y2="10.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          <circle cx="4" cy="3.5" r="1.5" fill="currentColor"/>
          <circle cx="10" cy="7" r="1.5" fill="currentColor"/>
          <circle cx="6" cy="10.5" r="1.5" fill="currentColor"/>
        </svg>
      </span>
      <strong>Filter</strong> - opens a dropdown to narrow the grid by date range, person, event type, or location. A badge on the icon indicates active filters.
    </li>
    <li>
      <span class="toolbar-icon" aria-hidden="true">
        <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
          <path d="M4 6l-3 3 3 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
          <path d="M1 9h9a4 4 0 0 1 0 8H8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" fill="none"/>
        </svg>
      </span>
      <strong>Undo</strong> - walk back through your recent edits. 50 levels of history. Keyboard: <kbd>Ctrl</kbd>+<kbd>Z</kbd>.
    </li>
    <li>
      <span class="toolbar-icon" aria-hidden="true">
        <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
          <path d="M12 6l3 3-3 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
          <path d="M15 9H6a4 4 0 0 0 0 8h2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" fill="none"/>
        </svg>
      </span>
      <strong>Redo</strong> - walk forward through undone edits. Keyboard: <kbd>Ctrl</kbd>+<kbd>Y</kbd>.
    </li>
  </ul>

  <h3>Actions</h3>

  <ul class="toolbar-list">
    <li>
      <span class="toolbar-icon" aria-hidden="true">
        <svg width="18" height="18" viewBox="0 -960 960 960">
          <path d="m370-80-16-128q-13-5-24.5-12T307-235l-119 50L78-375l103-78q-1-7-1-13.5v-27q0-6.5 1-13.5L78-585l110-190 119 50q11-8 23-15t24-12l16-128h220l16 128q13 5 24.5 12t22.5 15l119-50 110 190-103 78q1 7 1 13.5v27q0 6.5-2 13.5l103 78-110 190-118-50q-11 8-23 15t-24 12L590-80H370Zm70-80h79l14-106q31-8 57.5-23.5T639-327l99 41 39-68-86-65q5-14 7-29.5t2-31.5q0-16-2-31.5t-7-29.5l86-65-39-68-99 42q-22-23-48.5-38.5T533-694l-13-106h-79l-14 106q-31 8-57.5 23.5T321-633l-99-41-39 68 86 64q-5 15-7 30t-2 32q0 16 2 31t7 30l-86 65 39 68 99-42q22 23 48.5 38.5T427-266l13 106Zm42-180q58 0 99-41t41-99q0-58-41-99t-99-41q-59 0-99.5 41T342-480q0 58 40.5 99t99.5 41Zm-2-140Z" fill="currentColor"/>
        </svg>
      </span>
      <strong>Default Settings</strong> - opens the 6-tab settings modal (Appearance, Schedule, Event Types, Locations, Contacts, Show). This is where you configure theme, fonts, per-weekday call times, custom event types, location presets, and edit your cast and production team.
    </li>
    <li>
      <span class="toolbar-icon" aria-hidden="true">
        <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
          <path d="M3 10v3a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
          <line x1="8" y1="10" x2="8" y2="2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          <path d="M5.5 4.5L8 2l2.5 2.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
        </svg>
      </span>
      <strong>Export</strong> - opens a menu with PDF download (calendar layout), Print (browser dialog), CSV (plain spreadsheet or Google Calendar format), and Contact Sheet (CSV, DOCX, or PDF).
    </li>
    <li>
      <span class="toolbar-icon" aria-hidden="true">
        <svg width="18" height="18" viewBox="0 -960 960 960">
          <path d="M200-80q-33 0-56.5-23.5T120-160v-560q0-33 23.5-56.5T200-800h40v-80h80v80h320v-80h80v80h40q33 0 56.5 23.5T840-720v244q-19-9-39-15.5t-41-9.5v-59H200v400h252q7 22 16.5 42T491-80H200Zm0-560h560v-80H200v80Zm0 0v-80 80Zm460 520L528-252l56-56 76 76 152-152 56 56-208 208Z" fill="currentColor"/>
        </svg>
      </span>
      <strong>Collect conflicts</strong> - opens the conflict collection modal where you can generate a shareable link for actors to submit their scheduling conflicts. A numbered badge shows how many submissions are pending your review.
    </li>
    <li>
      <span class="toolbar-icon" aria-hidden="true">
        <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
          <path d="M14 2L7 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          <path d="M14 2l-4 13-2.5-5.5L2 7z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" fill="none"/>
        </svg>
      </span>
      <strong>Share</strong> - publishes a read-only share link your cast can visit to see the schedule, with per-actor filtering. A badge indicates you've made changes since the last publish.
    </li>
    <li>
      <span class="toolbar-icon" aria-hidden="true">
        <svg width="18" height="18" viewBox="0 -960 960 960">
          <path d="M260-160q-91 0-155.5-63T40-377q0-78 47-139t123-78q25-92 100-149t170-57q117 0 198.5 81.5T760-520q69 8 114.5 59.5T920-340q0 75-52.5 127.5T740-160H520q-33 0-56.5-23.5T440-240v-206l-64 62-56-56 160-160 160 160-56 56-64-62v206h220q42 0 71-29t29-71q0-42-29-71t-71-29h-60v-80q0-83-58.5-141.5T480-720q-83 0-141.5 58.5T280-520h-20q-58 0-99 41t-41 99q0 58 41 99t99 41h100v80H260Zm220-280Z" fill="currentColor"/>
        </svg>
      </span>
      <strong>Save</strong> - push the latest state to the cloud immediately. Your work is already saved locally on every edit; this just forces the background cloud sync to happen right away instead of waiting for its usual idle delay. The icon is a cloud with an upload arrow - hints at the cloud-sync nature.
    </li>
  </ul>

  <p class="muted">
    Toolbar icon labels can be turned on or off in <em>Default Settings →
    Appearance</em>. If you're new to the app and the icons feel ambiguous,
    enable labels for a while and turn them off once the icons become
    familiar.
  </p>

  <h2>Keyboard shortcuts (essentials)</h2>

  <ul>
    <li><kbd>Ctrl</kbd>+<kbd>Z</kbd> / <kbd>Ctrl</kbd>+<kbd>Y</kbd> - undo / redo (50 levels)</li>
    <li><kbd>Ctrl</kbd>+<kbd>S</kbd> - push to the cloud now (your work is already saved locally on every edit)</li>
    <li><kbd>Ctrl</kbd>+<kbd>C</kbd> / <kbd>Ctrl</kbd>+<kbd>X</kbd> / <kbd>Ctrl</kbd>+<kbd>V</kbd> - copy / cut / paste the selected day(s)</li>
    <li><kbd>Shift</kbd>+<kbd>A</kbd> / <kbd>M</kbd> / <kbd>W</kbd> / <kbd>D</kbd> - switch scope to All / Month / Week / Day</li>
    <li><kbd>←</kbd> / <kbd>→</kbd> (or <kbd>PageUp</kbd> / <kbd>PageDown</kbd>) - previous / next in the current scope view (Month, Week, Day)</li>
    <li><kbd>Shift</kbd>+<kbd>&lt;</kbd> - toggle the left Cast/Team sidebar</li>
    <li><kbd>Shift</kbd>+<kbd>&gt;</kbd> - toggle the right Day Tools sidebar</li>
    <li><kbd>Esc</kbd> - close the current editor, modal, or selection</li>
    <li><kbd>Double-click</kbd> a cell field to edit inline without opening the day editor</li>
    <li><kbd>Shift</kbd>+click or <kbd>Ctrl</kbd>+click to multi-select days for copy / paste / clear</li>
  </ul>

  <h2>Common questions</h2>

  <h3>Where is my data stored?</h3>
  <p>
    On your device first (local storage in your browser), backed up to
    cloud storage so you can access it from other devices. You can
    export any show as JSON at any time - that's a real portable backup
    you can keep on your own computer.
  </p>

  <h3>Does it work offline?</h3>
  <p>
    Yes. Once you've opened the app, edits save to your device
    instantly and work even if your internet drops mid-rehearsal. When
    you reconnect, changes sync up automatically.
  </p>

  <h3>Can I share my schedule with my cast?</h3>
  <p>
    Yes. Use the Share button in the toolbar to generate a read-only
    link. Actors visit the link, pick their name, and the calendar
    filters down to just the days they're called. Any change you make
    shows up on their view when they refresh.
  </p>

  <h3>How do I collect conflicts from actors?</h3>
  <p>
    Use the "Collect conflicts" button in the toolbar. It generates a
    link you can send to each actor. They fill in dates they can't
    make it, submit, and the entries show up in your Pending tab for
    review. Accept or reject each one; accepted conflicts merge into
    your show's conflict list.
  </p>

  <h3>Can I get my money back?</h3>
  <p>
    See the <a href="/terms">refund policy</a> in the terms of service.
    Short version: 7-day goodwill window, voided if you've already
    exported data or published a share link.
  </p>

  <h2>Still stuck?</h2>

  <p>
    Email us at <a href="mailto:hello@rehearsalblock.com">hello@rehearsalblock.com</a>.
    See the <a href="/contact">contact page</a> for what to include
    for the fastest response.
  </p>
</div>

<style>
  .help-page {
    padding: var(--space-6) var(--space-5);
  }

  .construction-banner {
    background: var(--color-info-bg);
    border: 1px solid var(--color-teal);
    border-radius: var(--radius-md);
    padding: var(--space-3) var(--space-4);
    margin-bottom: var(--space-5);
    color: var(--color-teal-dark);
    font-size: 0.875rem;
    line-height: 1.5;
  }

  h2 {
    margin-top: var(--space-6);
    margin-bottom: var(--space-3);
    font-size: 1.5rem;
  }

  h3 {
    margin-top: var(--space-4);
    margin-bottom: var(--space-2);
    font-size: 1.125rem;
    color: var(--color-plum-light);
  }

  ul {
    margin: 0 0 var(--space-4) 0;
    padding-left: var(--space-5);
  }

  li {
    margin-bottom: var(--space-2);
    line-height: 1.6;
  }

  p {
    line-height: 1.6;
  }

  kbd {
    display: inline-block;
    padding: 0.1rem 0.4rem;
    font-family: var(--font-mono);
    font-size: 0.85em;
    background: var(--color-bg-alt);
    border: 1px solid var(--color-border-strong);
    border-bottom-width: 2px;
    border-radius: var(--radius-sm);
    color: var(--color-text);
    white-space: nowrap;
  }

  .muted {
    color: var(--color-text-muted);
    font-size: 0.875rem;
    margin-top: var(--space-3);
  }

  /* Toolbar reference list: each item shows a plum-colored icon badge
     on the left with the strong name + description text flowing to the
     right. Uses float so the text can live as plain inline content (no
     wrapper span needed) and still wrap naturally alongside the icon. */
  .toolbar-list {
    list-style: none;
    padding-left: 0;
  }
  .toolbar-list > li {
    margin-bottom: var(--space-4);
    line-height: 1.6;
    overflow: hidden; /* contain the float */
    min-height: 32px;
  }
  .toolbar-icon {
    float: left;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    margin-right: var(--space-3);
    background: var(--color-bg-alt);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    color: var(--color-plum);
  }
  /* View toggle has two icons separated by a slash - wrap them together
     so they float as a single unit, keeping the slash between the icons
     rather than after the text. */
  .toolbar-icons {
    float: left;
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    margin-right: var(--space-3);
  }
  .toolbar-icons .toolbar-icon {
    float: none;
    margin-right: 0;
  }
  .toolbar-icon-sep {
    color: var(--color-text-subtle);
    font-weight: 400;
    padding: 0 2px;
    line-height: 32px;
  }
</style>
