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
    (<em>Romeo and Juliet</em>) with cast, crew, locations, and a few
    weeks of rehearsals already built out. Every feature is unlocked
    except saving and downloading. Poke around, drag cast onto days,
    click into cells to edit, open Settings, try the scope buttons.
    It's the fastest way to understand how the app fits together.
  </p>

  <h2>Key concepts</h2>

  <ul>
    <li><strong>Shows</strong> are containers for a production's schedule. One show per production.</li>
    <li><strong>Cast</strong> members are actors with characters. <strong>Crew</strong> members are production team. Both live in the sidebar and can be dragged onto days.</li>
    <li><strong>Groups</strong> let you call multiple cast at once (Ensemble, Leads, Dancers). "All Called" is a built-in group meaning everyone.</li>
    <li><strong>Event types</strong> are pill labels on days (Rehearsal, Tech, Dress, Performance). You configure the defaults in Settings.</li>
    <li><strong>Calls</strong> are the actual rehearsal blocks within a day. Most days have one call. Dress/performance days have multiple labeled calls (Crew Call, Actor Call, etc.).</li>
    <li><strong>Conflicts</strong> are dates or time windows when a cast member can't be at rehearsal. The grid shows them so you can plan around them.</li>
    <li><strong>Locations</strong> are rehearsal spaces with custom colors and shapes. Drag them onto days or specific calls.</li>
  </ul>

  <h2>Keyboard shortcuts (essentials)</h2>

  <ul>
    <li><kbd>Ctrl</kbd>+<kbd>Z</kbd> / <kbd>Ctrl</kbd>+<kbd>Y</kbd> - undo / redo (50 levels)</li>
    <li><kbd>Ctrl</kbd>+<kbd>S</kbd> - save now</li>
    <li><kbd>Shift</kbd>+<kbd>A</kbd> / <kbd>M</kbd> / <kbd>W</kbd> / <kbd>D</kbd> - switch scope to All / Month / Week / Day</li>
    <li><kbd>Double-click</kbd> a cell field to edit inline without opening the day editor</li>
    <li><kbd>Shift</kbd>+click or <kbd>Ctrl</kbd>+click to multi-select days for copy/paste/clear</li>
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
</style>
