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

  <ul>
    <li><strong>View toggle (Calendar / List)</strong> - switches between the calendar grid and the list view. The icon shows the mode you'll switch <em>to</em>, not the current mode.</li>
    <li><strong>Previous</strong> - step backward one unit in the current scope (one month, one week, or one day). Disabled in Overview mode.</li>
    <li><strong>View scope</strong> - opens a dropdown to pick Overview / Month / Week / Day. Controls how much of the schedule is visible at once. Keyboard: <kbd>Shift</kbd>+<kbd>A</kbd> / <kbd>M</kbd> / <kbd>W</kbd> / <kbd>D</kbd>.</li>
    <li><strong>Next</strong> - step forward one unit in the current scope. Disabled in Overview mode.</li>
    <li><strong>Filter</strong> - opens a dropdown to narrow the grid by date range, person, event type, or location. A badge indicates filters are active.</li>
    <li><strong>Undo</strong> - walk back through your recent edits. 50 levels of history. Keyboard: <kbd>Ctrl</kbd>+<kbd>Z</kbd>.</li>
    <li><strong>Redo</strong> - walk forward through undone edits. Keyboard: <kbd>Ctrl</kbd>+<kbd>Y</kbd>.</li>
  </ul>

  <h3>Actions</h3>

  <ul>
    <li><strong>Default Settings</strong> - opens the 6-tab settings modal (Appearance, Schedule, Event Types, Locations, Contacts, Show). This is where you configure theme, fonts, per-weekday call times, custom event types, location presets, and edit your cast and production team.</li>
    <li><strong>Export</strong> - opens a menu with PDF download (calendar layout), Print (browser dialog), CSV (plain spreadsheet or Google Calendar format), and Contact Sheet (CSV, DOCX, or PDF).</li>
    <li><strong>Collect conflicts</strong> - opens the conflict collection modal where you can generate a shareable link for actors to submit their scheduling conflicts. A numbered badge shows how many submissions are pending your review.</li>
    <li><strong>Share</strong> - publishes a read-only share link your cast can visit to see the schedule, with per-actor filtering. A badge indicates you've made changes since the last publish.</li>
    <li><strong>Save</strong> - push the latest state to the cloud immediately. Your work is already saved locally on every edit; this just forces the background cloud sync to happen right away instead of waiting for its usual idle delay.</li>
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
</style>
