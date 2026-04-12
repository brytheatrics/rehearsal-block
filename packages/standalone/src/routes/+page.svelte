<script lang="ts">
  import ComingSoonModal from "$lib/components/ComingSoonModal.svelte";
  import NotifyLaunchModal from "$lib/components/NotifyLaunchModal.svelte";

  let { data } = $props();

  /** Whether the launch-notification signup modal is open. */
  let notifyOpen = $state(false);
  /** Whether the "Coming soon" gate modal is open (shown when the
   *  disabled Buy Rehearsal Block button is clicked before launch). */
  let comingSoonOpen = $state(false);

  // Static cast data for the hero mockup + chip reel. These aren't real records -
  // they're hand-picked to showcase the product's visual language at small scale.
  type ChipData = { id: string; name: string; color: string };
  const reelCast: ChipData[] = [
    { id: "m", name: "Marcus", color: "#1e88e5" },
    { id: "a", name: "Ava", color: "#d81b60" },
    { id: "p", name: "Michael P.", color: "#43a047" },
    { id: "s", name: "Sam", color: "#f4511e" },
    { id: "d", name: "Diane", color: "#8e24aa" },
    { id: "t", name: "Theo", color: "#00897b" },
    { id: "r", name: "Riley", color: "#fb8c00" },
    { id: "mt", name: "Michael T.", color: "#5e35b1" },
  ];

  /* Hero preview animation - timed loop, NOT scroll-driven.
   *
   * The preview card builds up a week of rehearsals over a fixed
   * timeline:
   *   0 -> BUILD_MS (10s):    progress 0 -> 1, the 11 stages fire in
   *                           sequence (Marcus chip flies in, MON
   *                           builds, TUE goes DARK, Sam chip flies in,
   *                           THU builds, location pills land last)
   *   BUILD_MS -> +HOLD_MS:   progress holds at 1 so the user can read
   *                           the completed week
   *   +HOLD_MS -> +FADE_MS:   preview-card opacity 1 -> 0, smooth fade
   *   +FADE_MS -> +RESET_MS:  progress snaps to 0, opacity 0 -> 1
   *                           (the empty week reappears, ready to
   *                           build again)
   *   loop
   *
   * Driven by `requestAnimationFrame` against a `Date.now()` reference
   * so it's frame-rate independent. Paused via IntersectionObserver
   * when the hero is offscreen so we don't burn CPU on a hidden
   * animation while the user reads further down the page.
   *
   * The CSS classes .s1 through .s11 on .preview-card are still the
   * source of truth for which stage elements are visible - this script
   * just changes what computes the `stage` derived value.
   */

  const BUILD_MS = 10_000;
  const HOLD_MS = 2_000;
  const FADE_OUT_MS = 600;
  const FADE_IN_MS = 400;
  const TOTAL_MS = BUILD_MS + HOLD_MS + FADE_OUT_MS + FADE_IN_MS;

  let heroEl: HTMLElement | undefined = $state();
  let castReelEl: HTMLElement | undefined = $state();
  let castReelInView = $state(false);
  let progress = $state(0);
  let previewOpacity = $state(1);
  let isMobile = $state(false);

  /* Trigger the cast chip reel animation only when the user scrolls
     past it. The chips have a CSS keyframe animation gated on a
     `.in-view` class so they stay hidden until the IntersectionObserver
     fires. Once visible, the class stays on (no flicker if the user
     scrolls back up). */
  $effect(() => {
    if (!castReelEl) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            castReelInView = true;
            io.disconnect();
            return;
          }
        }
      },
      { threshold: 0.3 },
    );
    io.observe(castReelEl);
    return () => io.disconnect();
  });

  $effect(() => {
    // Capture the heroEl dependency, then run all the imperative
    // setup once. We deliberately do NOT read `isMobile` or any
    // visibility state inside this effect's reactive scope - those
    // are tracked imperatively (via plain closure variables) so the
    // effect doesn't re-run and tear down/rebuild the rAF + IO every
    // time they change.
    if (!heroEl) return;

    let visible = true;
    let rafId = 0;
    let startTs = performance.now();

    const onResize = () => {
      isMobile = window.innerWidth < 960;
    };
    onResize();
    window.addEventListener("resize", onResize);

    const tick = (now: number) => {
      const elapsed = (now - startTs) % TOTAL_MS;
      if (elapsed < BUILD_MS) {
        progress = elapsed / BUILD_MS;
        previewOpacity = 1;
      } else if (elapsed < BUILD_MS + HOLD_MS) {
        progress = 1;
        previewOpacity = 1;
      } else if (elapsed < BUILD_MS + HOLD_MS + FADE_OUT_MS) {
        const t = (elapsed - BUILD_MS - HOLD_MS) / FADE_OUT_MS;
        progress = 1;
        previewOpacity = 1 - t;
      } else {
        const t = (elapsed - BUILD_MS - HOLD_MS - FADE_OUT_MS) / FADE_IN_MS;
        progress = 0;
        previewOpacity = t;
      }
      if (visible) rafId = requestAnimationFrame(tick);
    };

    // Pause the loop when the hero is scrolled offscreen so we don't
    // burn CPU on a hidden animation. When it comes back, restart the
    // loop from t=0 so the user always sees the build from the
    // beginning instead of jumping into the middle of a hold/fade.
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            if (!visible) {
              visible = true;
              startTs = performance.now();
              rafId = requestAnimationFrame(tick);
            }
          } else {
            visible = false;
            cancelAnimationFrame(rafId);
          }
        }
      },
      { rootMargin: "0px" },
    );
    io.observe(heroEl);

    rafId = requestAnimationFrame(tick);

    return () => {
      visible = false;
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", onResize);
      io.disconnect();
    };
  });

  /*
   * 11 stage thresholds as fractions of the build phase (0-1).
   * Same ordering as the previous scroll-driven version - Marcus chip
   * flies in first, MON builds, TUE goes DARK, Sam chip lags behind,
   * THU builds, location pills land last.
   */
  const STAGE_THRESHOLDS = [
    0.04, // 1: Marcus flying chip appears, starts drag
    0.12, // 2: Marcus mid-drag
    0.19, // 3: MON REHEARSAL badge slides in
    0.26, // 4: MON Marcus chip lands, TUE DARK badge
    0.33, // 5: MON call time, Sam flying chip appears
    0.40, // 6: MON description, Sam mid-drag
    0.50, // 7: MON Ava chip, THU REHEARSAL badge
    0.58, // 8: MON location (MON DONE), Sam lands, THU time
    0.68, // 9: THU Riley chip
    0.79, // 10: THU description
    0.91, // 11: THU location (final fill)
  ];

  const stage = $derived(STAGE_THRESHOLDS.filter((t) => progress >= t).length);

  const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

  /*
   * Flying chip 1 (Marcus -> MON). Fades in at 0.04, drags 0.04 -> 0.22,
   * fades out 0.22 -> 0.26 as the real Marcus chip appears at stage 4.
   */
  const chipDrag = $derived(isMobile ? 1 : clamp01((progress - 0.04) / 0.18));
  const chipOpacity = $derived.by(() => {
    if (isMobile) return 0;
    const fadeIn = clamp01((progress - 0.04) / 0.02);
    const fadeOut = clamp01((0.26 - progress) / 0.04);
    return Math.min(fadeIn, fadeOut);
  });
  const isDragging = $derived(!isMobile && progress > 0.03);

  /*
   * Flying chip 2 (Sam -> THU). Fades in at 0.33 (stage 5), drags
   * 0.33 -> 0.54, fades out 0.54 -> 0.58 as the real Sam chip appears
   * at stage 8 (0.58).
   */
  const chip2Drag = $derived(isMobile ? 1 : clamp01((progress - 0.33) / 0.21));
  const chip2Opacity = $derived.by(() => {
    if (isMobile) return 0;
    const fadeIn = clamp01((progress - 0.33) / 0.02);
    const fadeOut = clamp01((0.58 - progress) / 0.04);
    return Math.min(fadeIn, fadeOut);
  });
  const isDragging2 = $derived(!isMobile && progress > 0.31);
</script>

<svelte:head>
  <title>Rehearsal Block - Scheduling for theatre directors and stage managers</title>
</svelte:head>

<!-- ========== HERO (timed loop animation, no scroll pin) ========== -->
<section class="hero" bind:this={heroEl}>
  <div class="hero-glow" aria-hidden="true"></div>

  <div class="hero-grid">
    <!-- Left: copy -->
    <div class="hero-copy">
      <p class="eyebrow">For theatre directors &amp; stage managers</p>

      <h1 class="hero-title">
        <span class="line">Rehearsal scheduling,</span>
        <span class="line accent">built for the way</span>
        <span class="line">you actually work.</span>
      </h1>

      <p class="hero-lede">
        Drag your cast onto days. Stack call times. See conflicts before they become
        a problem. Print a clean schedule you'd actually hand to an actor.
      </p>

      <div class="hero-actions">
        <a href="/demo" class="btn btn-primary btn-lg">
          Try the Demo
          <span class="arrow" aria-hidden="true">→</span>
        </a>
        {#if data.profile?.has_paid}
          <a href="/app" class="btn btn-outline btn-lg">Go to your shows</a>
        {/if}
      </div>

      <p class="trust-line">
        <span>One-time purchase</span>
        <span class="dot" aria-hidden="true">·</span>
        <span>Unlimited shows</span>
      </p>
      <p class="trust-line trust-line-2">
        <span>Works offline</span>
        <span class="dot" aria-hidden="true">·</span>
        <span>Free updates</span>
      </p>
    </div>

    <!-- Right: faux calendar preview with scroll-driven progressive fill -->
    <div
      class="preview-stage"
      role="img"
      aria-label="Live preview of the Rehearsal Block calendar. Scroll to build up a week of rehearsals for Romeo and Juliet."
    >
      <div
        class="preview-card"
        class:s1={stage >= 1}
        class:s2={stage >= 2}
        class:s3={stage >= 3}
        class:s4={stage >= 4}
        class:s5={stage >= 5}
        class:s6={stage >= 6}
        class:s7={stage >= 7}
        class:s8={stage >= 8}
        class:s9={stage >= 9}
        class:s10={stage >= 10}
        class:s11={stage >= 11}
        style="--chip-drag: {chipDrag}; --chip-opacity: {chipOpacity}; --chip2-drag: {chip2Drag}; --chip2-opacity: {chip2Opacity}; opacity: {previewOpacity}; transition: opacity 200ms ease;"
      >
        <header class="preview-header">
          <div class="preview-title-group">
            <h3 class="preview-show">Romeo &amp; Juliet</h3>
            <p class="preview-dates">May 4 - Jun 14, 2026</p>
          </div>
          <div class="preview-scope">Week</div>
        </header>

        <!-- Flying chip 1: Marcus drags into MON -->
        <span
          class="flying-chip flying-chip-1"
          class:dragging={isDragging}
          style="--chip: #1e88e5"
          aria-hidden="true"
        >
          <span class="p-chip-dot"></span>Marcus
        </span>

        <!-- Flying chip 2: Sam drags into THU (appears at stage 5, behind MON) -->
        <span
          class="flying-chip flying-chip-2"
          class:dragging={isDragging2}
          style="--chip: #f4511e"
          aria-hidden="true"
        >
          <span class="p-chip-dot"></span>Sam
        </span>

        <div class="preview-week">
          <!-- MON (focus day 1 - builds stages 3-7) -->
          <div class="p-day p-day-focus">
            <div class="p-day-head">
              <span class="p-dow">MON</span>
              <span class="p-date">4</span>
            </div>
            <div class="p-badge p-badge-rehearsal a-badge">REHEARSAL</div>
            <div class="p-time a-time">7:00 - 9:30 PM</div>
            <div class="p-chips">
              <span class="p-chip a-chip-marcus" style="--chip: #1e88e5"><span class="p-chip-dot"></span>Marcus</span>
              <span class="p-chip a-chip-ava" style="--chip: #d81b60"><span class="p-chip-dot"></span>Ava</span>
            </div>
            <p class="p-desc a-desc">Read-through, Act I</p>
            <div class="p-location a-location">
              <span class="p-loc-shape"></span>
              Rehearsal Hall
            </div>
          </div>

          <!-- TUE (DARK day - badge appears at stage 4) -->
          <div class="p-day p-day-tue-anim">
            <div class="p-day-head">
              <span class="p-dow">TUE</span>
              <span class="p-date">5</span>
            </div>
            <div class="p-badge p-badge-dark tu-dark">DARK</div>
          </div>

          <!-- WED (pre-filled REHEARSAL - visual anchor) -->
          <div class="p-day">
            <div class="p-day-head">
              <span class="p-dow">WED</span>
              <span class="p-date">6</span>
            </div>
            <div class="p-badge p-badge-rehearsal">REHEARSAL</div>
            <div class="p-time">7:00 - 9:30 PM</div>
            <div class="p-chips">
              <span class="p-chip" style="--chip: #1e88e5"><span class="p-chip-dot"></span>Marcus</span>
              <span class="p-chip" style="--chip: #00897b"><span class="p-chip-dot"></span>Theo</span>
            </div>
            <p class="p-desc">Blocking 1.1 - street brawl</p>
            <div class="p-location">
              <span class="p-loc-shape"></span>
              Main Stage
            </div>
          </div>

          <!-- THU (focus day 2 - builds stages 7-11, lags behind MON) -->
          <div class="p-day p-day-focus-2">
            <div class="p-day-head">
              <span class="p-dow">THU</span>
              <span class="p-date">7</span>
            </div>
            <div class="p-badge p-badge-rehearsal b-badge">REHEARSAL</div>
            <div class="p-time b-time">6:00 - 8:00 PM</div>
            <div class="p-chips">
              <span class="p-chip b-chip-sam" style="--chip: #f4511e"><span class="p-chip-dot"></span>Sam</span>
              <span class="p-chip b-chip-riley" style="--chip: #fb8c00"><span class="p-chip-dot"></span>Riley</span>
            </div>
            <p class="p-desc b-desc">Fight call: Act 3 duel</p>
            <div class="p-location b-location">
              <span class="p-loc-shape"></span>
              Main Stage
            </div>
          </div>

          <!-- FRI (pre-filled, no animation) -->
          <div class="p-day">
            <div class="p-day-head">
              <span class="p-dow">FRI</span>
              <span class="p-date">8</span>
            </div>
            <div class="p-badge p-badge-rehearsal">REHEARSAL</div>
            <div class="p-time">6:30 - 8:00 PM</div>
            <div class="p-chips">
              <span class="p-chip" style="--chip: #d81b60"><span class="p-chip-dot"></span>Ava</span>
              <span class="p-chip" style="--chip: #8e24aa"><span class="p-chip-dot"></span>Diane</span>
            </div>
            <div class="p-conflict">
              <svg viewBox="0 0 24 24" width="10" height="10" fill="currentColor" aria-hidden="true">
                <path d="M12 2L1 21h22L12 2zm0 6l7.53 13H4.47L12 8zm-1 4v4h2v-4h-2zm0 5v2h2v-2h-2z" />
              </svg>
              Ava conflict
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- ========== CAST CHIP REEL ========== -->
<section
  class="cast-reel"
  class:in-view={castReelInView}
  bind:this={castReelEl}
  aria-label="Cast members"
>
  <div class="cast-reel-inner">
    <p class="reel-label">The cast <span class="reel-dash">-</span></p>
    <div class="reel-chips">
      {#each reelCast as member, i (member.id)}
        <span
          class="reel-chip"
          style="--chip: {member.color}; --i: {i}"
        >
          <span class="reel-chip-dot"></span>
          {member.name}
        </span>
      {/each}
    </div>
  </div>
</section>

<!-- ========== FEATURES (alternating rows) ========== -->
<section class="features">
  <div class="features-inner">
    <!-- Row 1: copy left, month mockup right -->
    <div class="feature-row">
      <div class="feature-copy">
        <p class="feature-tag">Calendar first</p>
        <h2 class="feature-title">See the whole show at once.</h2>
        <p class="feature-body">
          A month view with every rehearsal, dark day, tech, and dress. Each cell
          shows who's called, what time, where, and what you're working on - so
          you can plan weeks ahead without losing track of details.
        </p>
      </div>
      <div class="feature-mockup mockup-month" aria-hidden="true">
        <div class="mm-head">
          <div class="mm-title">
            <span class="mm-show">Romeo &amp; Juliet</span>
            <span class="mm-month">May 2026</span>
          </div>
          <div class="mm-scope">Month</div>
        </div>
        <div class="mm-weekdays">
          {#each ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"] as d (d)}
            <div class="mm-wd">{d}</div>
          {/each}
        </div>
        <div class="mm-grid">
          <!-- Row 1: May 3-9 -->
          <div class="mm-cell mm-out"><span class="mm-num">3</span></div>
          <div class="mm-cell mm-has">
            <div class="mm-cell-head"><span class="mm-num">4</span><span class="mm-monlabel">MAY</span><span class="mm-et mm-et-rehearsal">REHEARSAL</span></div>
            <div class="mm-time">7-9:30 PM</div>
            <div class="mm-cell-chips">
              <span class="mm-minichip" style="--chip: #1e88e5"><span class="mm-minichip-dot"></span>Marcus</span>
              <span class="mm-minichip" style="--chip: #d81b60"><span class="mm-minichip-dot"></span>Ava</span>
            </div>
          </div>
          <div class="mm-cell"><span class="mm-num">5</span></div>
          <div class="mm-cell mm-has">
            <div class="mm-cell-head"><span class="mm-num">6</span><span class="mm-et mm-et-rehearsal">REHEARSAL</span></div>
            <div class="mm-time">7-9:30 PM</div>
            <div class="mm-cell-chips">
              <span class="mm-minichip" style="--chip: #1e88e5"><span class="mm-minichip-dot"></span>Marcus</span>
              <span class="mm-minichip" style="--chip: #00897b"><span class="mm-minichip-dot"></span>Theo</span>
            </div>
          </div>
          <div class="mm-cell"><span class="mm-num">7</span></div>
          <div class="mm-cell mm-has">
            <div class="mm-cell-head"><span class="mm-num">8</span><span class="mm-et mm-et-rehearsal">REHEARSAL</span></div>
            <div class="mm-time">6:30-8 PM</div>
          </div>
          <div class="mm-cell"><span class="mm-num">9</span></div>

          <!-- Row 2: May 10-16 -->
          <div class="mm-cell"><span class="mm-num">10</span></div>
          <div class="mm-cell mm-has">
            <div class="mm-cell-head"><span class="mm-num">11</span><span class="mm-et mm-et-rehearsal">REHEARSAL</span></div>
            <div class="mm-time">7-9:30 PM</div>
            <div class="mm-cell-chips">
              <span class="mm-minichip" style="--chip: #1e88e5"><span class="mm-minichip-dot"></span>Marcus</span>
            </div>
          </div>
          <div class="mm-cell"><span class="mm-num">12</span></div>
          <div class="mm-cell mm-has mm-conflict">
            <div class="mm-cell-head"><span class="mm-num">13</span><span class="mm-et mm-et-rehearsal">REHEARSAL</span></div>
            <div class="mm-time">7-9:30 PM</div>
            <div class="mm-cell-chips">
              <span class="mm-minichip" style="--chip: #d81b60"><span class="mm-minichip-dot"></span>Ava</span>
              <span class="mm-minichip" style="--chip: #8e24aa"><span class="mm-minichip-dot"></span>Diane</span>
            </div>
          </div>
          <div class="mm-cell"><span class="mm-num">14</span></div>
          <div class="mm-cell"><span class="mm-num">15</span></div>
          <div class="mm-cell"><span class="mm-num">16</span></div>

          <!-- Row 3: May 17-23 -->
          <div class="mm-cell"><span class="mm-num">17</span></div>
          <div class="mm-cell mm-has">
            <div class="mm-cell-head"><span class="mm-num">18</span><span class="mm-et mm-et-rehearsal">REHEARSAL</span></div>
            <div class="mm-time">7-9 PM</div>
          </div>
          <div class="mm-cell"><span class="mm-num">19</span></div>
          <div class="mm-cell mm-has">
            <div class="mm-cell-head"><span class="mm-num">20</span><span class="mm-et mm-et-rehearsal">REHEARSAL</span></div>
            <div class="mm-time">7-9:30 PM</div>
          </div>
          <div class="mm-cell"><span class="mm-num">21</span></div>
          <div class="mm-cell"><span class="mm-num">22</span></div>
          <div class="mm-cell"><span class="mm-num">23</span></div>

          <!-- Row 4: May 24-30 -->
          <div class="mm-cell"><span class="mm-num">24</span></div>
          <div class="mm-cell mm-has mm-holiday">
            <div class="mm-cell-head"><span class="mm-num">25</span></div>
            <div class="mm-holiday-label">Memorial Day</div>
          </div>
          <div class="mm-cell"><span class="mm-num">26</span></div>
          <div class="mm-cell mm-has">
            <div class="mm-cell-head"><span class="mm-num">27</span><span class="mm-et mm-et-rehearsal">REHEARSAL</span></div>
            <div class="mm-time">7-9:30 PM</div>
          </div>
          <div class="mm-cell"><span class="mm-num">28</span></div>
          <div class="mm-cell mm-has">
            <div class="mm-cell-head"><span class="mm-num">29</span><span class="mm-et mm-et-tech">TECH</span></div>
            <div class="mm-time">6-10 PM</div>
          </div>
          <div class="mm-cell"><span class="mm-num">30</span></div>

          <!-- Row 5: May 31 + Jun 1-6 -->
          <div class="mm-cell mm-has">
            <div class="mm-cell-head"><span class="mm-num">31</span><span class="mm-et mm-et-dress">DRESS</span></div>
            <div class="mm-time">7 PM</div>
          </div>
          <div class="mm-cell mm-out"><span class="mm-num">1</span><span class="mm-monlabel">JUN</span></div>
          <div class="mm-cell mm-out"><span class="mm-num">2</span></div>
          <div class="mm-cell mm-out"><span class="mm-num">3</span></div>
          <div class="mm-cell mm-out"><span class="mm-num">4</span></div>
          <div class="mm-cell mm-out"><span class="mm-num">5</span></div>
          <div class="mm-cell mm-out"><span class="mm-num">6</span></div>
        </div>
      </div>
    </div>

    <!-- Row 2: cast sidebar mockup left, copy right -->
    <div class="feature-row feature-row-rev">
      <div class="feature-copy">
        <p class="feature-tag">Cast &amp; conflicts</p>
        <h2 class="feature-title">A cast that knows when it's called.</h2>
        <p class="feature-body">
          Color-coded actors. Groups for scene work. Conflict dates that actually
          warn you when you try to double-book. Drag an actor onto a day and the
          rest takes care of itself.
        </p>
      </div>
      <div class="feature-mockup mockup-cast" aria-hidden="true">
        <div class="mc-head">
          <span>CAST</span>
          <span class="mc-count">(8)</span>
        </div>
        <div class="mc-list">
          <div class="mc-row"><span class="mc-dot" style="background: #1e88e5"></span>Marcus Chen<span class="mc-char">Romeo</span></div>
          <div class="mc-row"><span class="mc-dot" style="background: #d81b60"></span>Ava Rodriguez<span class="mc-char">Juliet</span></div>
          <div class="mc-row mc-row-warn">
            <span class="mc-dot" style="background: #43a047"></span>Michael Patel<span class="mc-char">Mercutio</span>
            <svg viewBox="0 0 24 24" width="11" height="11" fill="currentColor" aria-hidden="true">
              <path d="M12 2L1 21h22L12 2zm0 6l7.53 13H4.47L12 8zm-1 4v4h2v-4h-2zm0 5v2h2v-2h-2z" />
            </svg>
          </div>
          <div class="mc-row"><span class="mc-dot" style="background: #f4511e"></span>Sam O'Brien<span class="mc-char">Tybalt</span></div>
          <div class="mc-row"><span class="mc-dot" style="background: #8e24aa"></span>Diane Walker<span class="mc-char">Nurse</span></div>
          <div class="mc-row"><span class="mc-dot" style="background: #00897b"></span>Theo Nakamura<span class="mc-char">Friar Laurence</span></div>
        </div>
        <div class="mc-groups">
          <span class="mc-group"><span class="mc-star">★</span> Montagues</span>
          <span class="mc-group"><span class="mc-star">★</span> Capulets</span>
        </div>
      </div>
    </div>

    <!-- Row 3: copy left, share-link mockup right -->
    <div class="feature-row">
      <div class="feature-copy">
        <p class="feature-tag">Share &amp; filter</p>
        <h2 class="feature-title">Send one link. Every actor sees just their days.</h2>
        <p class="feature-body">
          Share a live link with your cast. They pick their name and the calendar
          filters down to the days they're called. No more "wait, am I in this
          scene?" texts at 10pm. The link stays live - any change you make shows
          up on their phones.
        </p>
        <p class="feature-subtext">
          Need a paper copy? Export calendar PDF, contact sheet PDF, DOCX, or CSV.
        </p>
      </div>
      <div class="feature-mockup mockup-share" aria-hidden="true">
        <div class="ms-browser">
          <div class="ms-browser-bar">
            <span class="ms-dot"></span>
            <span class="ms-dot"></span>
            <span class="ms-dot"></span>
            <span class="ms-url">rehearsalblock.com/view/abc123</span>
          </div>
          <div class="ms-body">
            <div class="ms-header">
              <span class="ms-show">Romeo &amp; Juliet</span>
              <span class="ms-dates">May 4 - Jun 14, 2026</span>
            </div>
            <div class="ms-filter">
              <span class="ms-filter-label">Show schedule for</span>
              <div class="ms-filter-select">
                <span class="ms-filter-dot" style="background: #1e88e5"></span>
                Marcus Chen
                <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor" aria-hidden="true">
                  <path d="M7 10l5 5 5-5z" />
                </svg>
              </div>
              <span class="ms-filter-count">8 days called</span>
            </div>
            <div class="ms-grid">
              {#each Array(28) as _, i}
                {@const day = i + 1}
                {@const called = [4, 6, 11, 13, 18, 20, 22, 27].includes(day)}
                {@const scheduled = [4, 6, 8, 11, 13, 15, 18, 20, 22, 25, 27, 29].includes(day)}
                <div class="ms-cell" class:ms-called={called} class:ms-muted={scheduled && !called}>
                  <span class="ms-num">{day}</span>
                  {#if called}
                    <span class="ms-mini">7-9:30</span>
                  {/if}
                </div>
              {/each}
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- ========== CLOSING CTA ========== -->
<section class="closing">
  <div class="closing-glow" aria-hidden="true"></div>
  <div class="closing-inner">
    <p class="closing-eyebrow">Ready when you are</p>
    <h2 class="closing-title">
      Your next production starts<br />with a single day.
    </h2>
    <div class="closing-actions">
      <a href="/demo" class="btn btn-primary btn-lg">
        Try the Demo
        <span class="arrow" aria-hidden="true">→</span>
      </a>
      {#if !data.profile?.has_paid}
        <button
          type="button"
          class="btn btn-ghost btn-lg"
          onclick={() => (comingSoonOpen = true)}
        >
          Buy Rehearsal Block
        </button>
      {/if}
    </div>
    <p class="closing-note">No account needed. Works in your browser.</p>
    <button type="button" class="notify-link" onclick={() => (notifyOpen = true)}>
      Notify me when it launches
    </button>
  </div>
</section>

{#if comingSoonOpen}
  <ComingSoonModal
    context="purchase"
    onclose={() => (comingSoonOpen = false)}
    onnotify={() => {
      comingSoonOpen = false;
      notifyOpen = true;
    }}
  />
{/if}

{#if notifyOpen}
  <NotifyLaunchModal source="landing" onclose={() => (notifyOpen = false)} />
{/if}

<style>
  /* ==================== HERO ==================== */
  /*
   * Landing hero - timed loop animation, no scroll pin. The hero sits
   * in normal flow as a regular section and the rAF loop plays
   * continuously while the hero is on-screen (paused via
   * IntersectionObserver when scrolled past). */
  .hero {
    position: relative;
    min-height: calc(100vh - 80px);
    display: flex;
    align-items: center;
    overflow: hidden;
    padding: var(--space-7) 0;
  }

  .hero-glow {
    position: absolute;
    top: -10%;
    left: -5%;
    width: 55%;
    height: 120%;
    background: radial-gradient(
      ellipse at 30% 40%,
      rgba(56, 129, 125, 0.18) 0%,
      rgba(56, 129, 125, 0.05) 40%,
      transparent 70%
    );
    pointer-events: none;
    z-index: 0;
  }

  .hero-grid {
    position: relative;
    z-index: 1;
    max-width: 1400px;
    margin: 0 auto;
    padding: 0 var(--space-5);
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1.15fr);
    gap: var(--space-8);
    align-items: center;
  }

  .hero-copy {
    max-width: 560px;
  }

  .eyebrow {
    font-family: var(--font-display);
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--color-teal);
    margin: 0 0 var(--space-4) 0;
  }

  .hero-title {
    font-family: var(--font-display);
    font-size: clamp(2.5rem, 5vw, 4.25rem);
    line-height: 1.02;
    font-weight: 500;
    letter-spacing: -0.02em;
    margin: 0 0 var(--space-5) 0;
    color: var(--color-plum);
  }

  .hero-title .line {
    display: block;
    opacity: 0;
    animation: word-in 700ms cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
  }
  .hero-title .line:nth-child(1) { animation-delay: 80ms; }
  .hero-title .line:nth-child(2) { animation-delay: 200ms; }
  .hero-title .line:nth-child(3) { animation-delay: 320ms; }

  .hero-title .accent {
    font-style: italic;
    font-weight: 400;
    color: var(--color-teal);
  }

  .hero-lede {
    font-family: var(--font-ui);
    font-size: 1.125rem;
    line-height: 1.55;
    color: var(--color-text-muted);
    margin: 0 0 var(--space-6) 0;
    max-width: 52ch;
  }

  .hero-actions {
    display: flex;
    gap: var(--space-3);
    flex-wrap: wrap;
    margin-bottom: var(--space-5);
  }

  .hero-actions :global(.btn) {
    font-family: var(--font-display);
    font-weight: 500;
    letter-spacing: 0.01em;
  }

  .arrow {
    display: inline-block;
    margin-left: 0.35em;
    transition: transform 200ms ease;
  }
  :global(.btn):hover .arrow {
    transform: translateX(3px);
  }

  .trust-line {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    color: var(--color-text-subtle);
    font-size: 0.8125rem;
    margin: 0;
  }
  /* Tighten the gap between the two trust-line rows so they read as
     a single 4-item block split across two lines, not two unrelated
     paragraphs. */
  .trust-line-2 {
    margin-top: 4px;
  }
  .trust-line .dot {
    opacity: 0.5;
  }

  /* Landing-specific button variants */
  :global(.btn-outline) {
    background: transparent;
    color: var(--color-plum);
    border: 1.5px solid var(--color-border-strong);
    padding: var(--space-4) var(--space-6);
    border-radius: var(--radius-md);
    text-decoration: none;
    font-weight: 500;
    font-size: 1.125rem;
    display: inline-flex;
    align-items: center;
    transition: all var(--transition-fast);
  }
  :global(.btn-outline:hover) {
    border-color: var(--color-plum);
    background: var(--color-bg-alt);
    text-decoration: none;
  }

  :global(.btn-ghost) {
    background: transparent;
    color: var(--color-text-inverse);
    border: 1.5px solid rgba(255, 255, 255, 0.35);
    padding: var(--space-4) var(--space-6);
    border-radius: var(--radius-md);
    text-decoration: none;
    font-weight: 500;
    font-size: 1.125rem;
    display: inline-flex;
    align-items: center;
    transition: all var(--transition-fast);
  }
  :global(.btn-ghost:hover) {
    border-color: rgba(255, 255, 255, 0.6);
    background: rgba(255, 255, 255, 0.05);
    text-decoration: none;
  }

  /* ==================== HERO PREVIEW CARD ==================== */
  .preview-stage {
    position: relative;
    perspective: 1400px;
  }

  .preview-card {
    position: relative;
    background: var(--color-bg);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    box-shadow:
      0 20px 40px -12px rgba(45, 31, 61, 0.22),
      0 8px 16px -8px rgba(45, 31, 61, 0.1);
    padding: var(--space-5);
    transform: rotate(-1.2deg);
    font-family: var(--font-ui);
    overflow: visible;
  }

  .preview-card::before {
    content: "";
    position: absolute;
    inset: 0;
    border-radius: var(--radius-lg);
    background: linear-gradient(
      135deg,
      rgba(56, 129, 125, 0.03) 0%,
      transparent 30%
    );
    pointer-events: none;
  }

  .preview-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    margin-bottom: var(--space-4);
    padding-bottom: var(--space-3);
    border-bottom: 1px solid var(--color-border);
  }

  .preview-show {
    font-family: var(--font-display);
    font-size: 1.375rem;
    font-weight: 600;
    color: var(--color-plum);
    margin: 0 0 2px 0;
    letter-spacing: -0.01em;
  }

  .preview-dates {
    font-size: 0.75rem;
    color: var(--color-text-muted);
    margin: 0;
  }

  .preview-scope {
    font-size: 0.6875rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--color-plum);
    background: var(--color-bg-alt);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    padding: 4px 10px;
  }

  .preview-week {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 6px;
    position: relative;
  }

  .p-day {
    background: var(--color-bg);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    padding: 6px;
    min-height: 180px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    position: relative;
  }
  .p-day-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    margin-bottom: 2px;
  }
  .p-dow {
    font-size: 0.5625rem;
    font-weight: 700;
    color: var(--color-text-subtle);
    letter-spacing: 0.06em;
  }
  .p-date {
    font-family: var(--font-display);
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--color-text-muted);
  }

  .p-badge {
    display: inline-block;
    padding: 1px 6px;
    font-size: 0.5625rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    border-radius: var(--radius-sm);
    align-self: flex-start;
  }
  .p-badge-rehearsal {
    background: #dbeafe;
    color: #1e40af;
  }
  .p-badge-dark {
    background: #e5e7eb;
    color: #374151;
  }

  .p-time {
    font-size: 0.625rem;
    font-weight: 700;
    color: #059669;
  }

  .p-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 3px;
  }

  .p-chip {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    background: var(--color-bg);
    border: 1px solid var(--color-border);
    border-left: 2px solid var(--chip);
    border-radius: 3px;
    padding: 1px 4px 1px 5px;
    font-size: 0.5625rem;
    font-weight: 600;
    color: var(--color-text);
    line-height: 1.2;
  }
  .p-chip-dot {
    display: inline-block;
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: var(--chip);
  }

  .p-desc {
    font-size: 0.5625rem;
    line-height: 1.3;
    color: var(--color-text-muted);
    margin: 0;
    font-style: italic;
  }

  .p-location {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    font-size: 0.5625rem;
    font-weight: 600;
    color: var(--color-teal);
    border: 1px solid var(--color-teal);
    border-radius: var(--radius-full);
    padding: 1px 6px;
    align-self: flex-start;
    margin-top: auto;
  }
  .p-loc-shape {
    display: inline-block;
    width: 5px;
    height: 5px;
    background: var(--color-teal);
    border-radius: 50%;
  }

  .p-conflict {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    font-size: 0.5625rem;
    font-weight: 600;
    color: var(--color-danger);
    margin-top: auto;
  }

  /* ==================== SCROLL-STAGED ANIMATION ==================== */
  /*
   * WED and FRI are pre-filled (visual anchors). MON, TUE, THU animate in
   * as the user scrolls, with MON finishing by stage 7 and THU lagging
   * behind so they build sequentially rather than in parallel.
   *
   * Stage map (see STAGE_THRESHOLDS in the script block):
   *   1-2: Marcus flying chip appears in left gap and drags toward MON
   *   3:   MON REHEARSAL badge slides in
   *   4:   MON Marcus chip lands, TUE DARK badge slides in
   *   5:   MON call time, Sam flying chip appears in right gap (lagging)
   *   6:   MON description, Sam mid-drag
   *   7:   MON Ava + location (MON DONE), Sam lands, THU REHEARSAL badge
   *   8:   THU Sam chip + THU call time
   *   9:   THU Riley chip
   *   10:  THU description
   *   11:  THU location pill (hero starts unpinning during this stage)
   */

  /* Stage 0: MON, TUE, THU content all hidden */
  .preview-card .p-day-focus .a-badge,
  .preview-card .p-day-focus .a-time,
  .preview-card .p-day-focus .a-chip-marcus,
  .preview-card .p-day-focus .a-chip-ava,
  .preview-card .p-day-focus .a-desc,
  .preview-card .p-day-focus .a-location,
  .preview-card .p-day-tue-anim .tu-dark,
  .preview-card .p-day-focus-2 .b-badge,
  .preview-card .p-day-focus-2 .b-time,
  .preview-card .p-day-focus-2 .b-chip-sam,
  .preview-card .p-day-focus-2 .b-chip-riley,
  .preview-card .p-day-focus-2 .b-desc,
  .preview-card .p-day-focus-2 .b-location {
    opacity: 0;
    transform: translateY(-6px);
    transition: opacity 450ms ease, transform 450ms ease;
  }

  /*
   * Flying chips - two of them, both hidden at scroll 0. Chip 1 (Marcus)
   * appears in the left gap at stage 1 and drags to MON. Chip 2 (Sam)
   * appears in the right gap at stage 5 and drags to THU.
   */
  .flying-chip {
    position: absolute;
    display: inline-flex;
    align-items: center;
    gap: 3px;
    background: var(--color-bg);
    border: 1px solid var(--color-border);
    border-left: 2px solid var(--chip);
    border-radius: 3px;
    padding: 3px 7px 3px 8px;
    font-size: 0.6875rem;
    font-weight: 600;
    color: var(--color-text);
    line-height: 1.2;
    box-shadow: 0 10px 24px -6px rgba(45, 31, 61, 0.35);
    opacity: 0;
    pointer-events: none;
    z-index: 2;
    transition: box-shadow 250ms ease;
  }

  /* Chip 1 (Marcus) - starts in left gap, drags right-down to MON */
  .flying-chip-1 {
    top: 260px;
    left: -56px;
    transform: rotate(-5deg);
  }
  .flying-chip-1.dragging {
    opacity: var(--chip-opacity, 0);
    transform:
      translate(
        calc(var(--chip-drag, 0) * 86px),
        calc(var(--chip-drag, 0) * -138px)
      )
      rotate(calc(-5deg + var(--chip-drag, 0) * 5deg))
      scale(calc(1 - var(--chip-drag, 0) * 0.08));
    box-shadow:
      0 calc(10px - var(--chip-drag, 0) * 6px)
      calc(24px - var(--chip-drag, 0) * 14px)
      -6px
      rgba(45, 31, 61, calc(0.35 - var(--chip-drag, 0) * 0.25));
  }

  /*
   * Chip 2 (Sam) - starts in RIGHT gap (right: -56px) and drags leftward
   * into THU. THU is column 4 of 5; from the right edge its badge area
   * is roughly 180px to the left and 138px up from the chip's start y.
   */
  .flying-chip-2 {
    top: 260px;
    right: -56px;
    transform: rotate(5deg);
  }
  .flying-chip-2.dragging {
    opacity: var(--chip2-opacity, 0);
    transform:
      translate(
        calc(var(--chip2-drag, 0) * -180px),
        calc(var(--chip2-drag, 0) * -138px)
      )
      rotate(calc(5deg - var(--chip2-drag, 0) * 5deg))
      scale(calc(1 - var(--chip2-drag, 0) * 0.08));
    box-shadow:
      0 calc(10px - var(--chip2-drag, 0) * 6px)
      calc(24px - var(--chip2-drag, 0) * 14px)
      -6px
      rgba(45, 31, 61, calc(0.35 - var(--chip2-drag, 0) * 0.25));
  }

  /* Stage 3: MON REHEARSAL badge slides in */
  .preview-card.s3 .p-day-focus .a-badge {
    opacity: 1;
    transform: translateY(0);
  }

  /* Stage 4: MON Marcus chip lands + TUE DARK badge appears */
  .preview-card.s4 .p-day-focus .a-chip-marcus,
  .preview-card.s4 .p-day-tue-anim .tu-dark {
    opacity: 1;
    transform: translateY(0);
  }
  .preview-card.s4 .p-day-tue-anim .tu-dark {
    transition-delay: 80ms;
  }

  /* Stage 5: MON call time appears (Sam chip 2 starts drag overhead) */
  .preview-card.s5 .p-day-focus .a-time {
    opacity: 1;
    transform: translateY(0);
  }

  /* Stage 6: MON description appears (Sam chip 2 mid-drag) */
  .preview-card.s6 .p-day-focus .a-desc {
    opacity: 1;
    transform: translateY(0);
  }

  /* Stage 7: MON Ava chip drops in, THU REHEARSAL badge slides in */
  .preview-card.s7 .p-day-focus .a-chip-ava,
  .preview-card.s7 .p-day-focus-2 .b-badge {
    opacity: 1;
    transform: translateY(0);
  }
  .preview-card.s7 .p-day-focus-2 .b-badge { transition-delay: 120ms; }

  /* Stage 8: MON location (MON DONE), THU Sam chip + THU call time */
  .preview-card.s8 .p-day-focus .a-location,
  .preview-card.s8 .p-day-focus-2 .b-chip-sam,
  .preview-card.s8 .p-day-focus-2 .b-time {
    opacity: 1;
    transform: translateY(0);
  }
  .preview-card.s8 .p-day-focus-2 .b-chip-sam { transition-delay: 80ms; }
  .preview-card.s8 .p-day-focus-2 .b-time { transition-delay: 160ms; }

  /* Stage 9: THU Riley chip drops in */
  .preview-card.s9 .p-day-focus-2 .b-chip-riley {
    opacity: 1;
    transform: translateY(0);
  }

  /* Stage 10: THU description fades in */
  .preview-card.s10 .p-day-focus-2 .b-desc {
    opacity: 1;
    transform: translateY(0);
  }

  /* Stage 11: THU location pill slides in (happens as hero starts unpinning) */
  .preview-card.s11 .p-day-focus-2 .b-location {
    opacity: 1;
    transform: translateY(0);
  }

  /* ==================== CAST CHIP REEL ==================== */
  .cast-reel {
    padding: var(--space-7) 0 var(--space-6);
    border-top: 1px solid var(--color-border);
    border-bottom: 1px solid var(--color-border);
    background: var(--color-bg-alt);
    overflow: hidden;
  }

  .cast-reel-inner {
    max-width: 1400px;
    margin: 0 auto;
    padding: 0 var(--space-5);
    display: flex;
    align-items: center;
    gap: var(--space-5);
    flex-wrap: wrap;
  }

  .reel-label {
    font-family: var(--font-display);
    font-style: italic;
    font-size: 1.125rem;
    color: var(--color-text-muted);
    margin: 0;
    white-space: nowrap;
  }
  .reel-dash {
    color: var(--color-text-subtle);
    margin-left: 0.2em;
  }

  .reel-chips {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
    flex: 1;
  }

  .reel-chip {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    background: var(--color-bg);
    border: 1px solid var(--color-border);
    border-left: 3px solid var(--chip);
    border-radius: var(--radius-sm);
    padding: 6px 12px 6px 10px;
    font-family: var(--font-ui);
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--color-text);
    box-shadow: var(--shadow-sm);
    /* Hidden by default. The cascade-in animation only fires when
       .cast-reel.in-view is set by the IntersectionObserver, so the
       chips stay invisible until the user scrolls them into view -
       then they cascade in one at a time, ~70ms per chip. */
    opacity: 0;
    transform: translateY(12px);
    transition: transform 250ms ease, box-shadow 250ms ease;
  }
  .cast-reel.in-view .reel-chip {
    animation: reel-in 600ms cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
    animation-delay: calc(var(--i) * 90ms);
  }
  .reel-chip:hover {
    transform: translateY(-3px);
    box-shadow: var(--shadow-md);
  }

  .reel-chip-dot {
    display: inline-block;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--chip);
  }

  /* ==================== FEATURES ==================== */
  .features {
    padding: var(--space-8) 0;
  }
  .features-inner {
    max-width: 1200px;
    margin: 0 auto;
    padding: 0 var(--space-5);
    display: flex;
    flex-direction: column;
    gap: var(--space-8);
  }

  .feature-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-8);
    align-items: center;
  }
  .feature-row-rev .feature-copy {
    order: 2;
  }
  .feature-row-rev .feature-mockup {
    order: 1;
  }

  .feature-copy {
    max-width: 480px;
  }

  .feature-tag {
    font-family: var(--font-display);
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--color-teal);
    margin: 0 0 var(--space-3) 0;
  }

  .feature-title {
    font-family: var(--font-display);
    font-size: clamp(1.75rem, 3vw, 2.5rem);
    line-height: 1.1;
    font-weight: 500;
    letter-spacing: -0.015em;
    color: var(--color-plum);
    margin: 0 0 var(--space-4) 0;
  }

  .feature-body {
    font-family: var(--font-ui);
    font-size: 1rem;
    line-height: 1.6;
    color: var(--color-text-muted);
    margin: 0;
  }

  .feature-mockup {
    background: var(--color-bg);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    padding: var(--space-4);
    box-shadow: var(--shadow-md);
    font-family: var(--font-ui);
  }

  /* --- Month mockup (replica of real Month scope view) --- */
  .mockup-month {
    padding: var(--space-4);
  }
  .mockup-month .mm-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--space-3);
    padding-bottom: var(--space-3);
    border-bottom: 1px solid var(--color-border);
  }
  .mm-title {
    display: flex;
    align-items: baseline;
    gap: var(--space-2);
  }
  .mm-show {
    font-family: var(--font-display);
    font-size: 1.125rem;
    font-weight: 600;
    color: var(--color-plum);
    letter-spacing: -0.01em;
  }
  .mm-month {
    font-size: 0.6875rem;
    color: var(--color-text-muted);
  }
  .mm-scope {
    font-size: 0.5625rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--color-plum);
    background: var(--color-bg-alt);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    padding: 3px 8px;
  }
  .mm-weekdays {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 2px;
    margin-bottom: 3px;
  }
  .mm-wd {
    font-size: 0.5rem;
    font-weight: 700;
    color: var(--color-text-subtle);
    letter-spacing: 0.05em;
    text-align: right;
    padding-right: 4px;
  }
  .mm-grid {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 2px;
  }
  .mm-cell {
    min-height: 60px;
    border: 1px solid var(--color-border);
    border-radius: 3px;
    padding: 4px 4px 3px;
    background: var(--color-bg);
    display: flex;
    flex-direction: column;
    gap: 2px;
    position: relative;
  }
  .mm-cell.mm-out {
    background: #f9fafb;
    border-style: dashed;
    border-color: var(--color-border);
  }
  .mm-cell.mm-conflict {
    border-color: rgba(220, 38, 38, 0.3);
  }
  .mm-cell.mm-conflict::after {
    content: "";
    position: absolute;
    top: 2px;
    right: 2px;
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: var(--color-danger);
  }
  .mm-cell.mm-holiday {
    background: #fffbeb;
    border-color: #fcd34d;
  }

  .mm-cell-head {
    display: flex;
    align-items: baseline;
    gap: 3px;
    flex-wrap: wrap;
  }
  .mm-num {
    font-size: 0.625rem;
    font-weight: 600;
    color: var(--color-plum);
  }
  .mm-cell.mm-out .mm-num {
    color: var(--color-text-subtle);
    font-weight: 500;
  }
  .mm-monlabel {
    font-size: 0.5rem;
    font-weight: 600;
    color: var(--color-text-subtle);
    letter-spacing: 0.04em;
  }
  .mm-et {
    display: inline-block;
    margin-left: auto;
    padding: 0 4px;
    font-size: 0.4375rem;
    font-weight: 700;
    letter-spacing: 0.03em;
    text-transform: uppercase;
    border-radius: 2px;
    white-space: nowrap;
  }
  .mm-et-rehearsal {
    background: #dbeafe;
    color: #1e40af;
  }
  .mm-et-tech {
    background: #fed7aa;
    color: #9a3412;
  }
  .mm-et-dress {
    background: #e9d5ff;
    color: #6b21a8;
  }

  .mm-time {
    font-size: 0.5rem;
    font-weight: 700;
    color: #059669;
  }

  .mm-cell-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 2px;
  }
  .mm-minichip {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    border-left: 2px solid var(--chip);
    border-radius: 2px;
    padding: 0 3px;
    font-size: 0.4375rem;
    font-weight: 600;
    color: var(--color-text);
    background: var(--color-bg);
    line-height: 1.3;
  }
  .mm-minichip-dot {
    display: inline-block;
    width: 3px;
    height: 3px;
    border-radius: 50%;
    background: var(--chip);
  }

  .mm-holiday-label {
    font-size: 0.5rem;
    font-weight: 600;
    color: #92400e;
    margin-top: auto;
  }

  /* --- Cast mockup --- */
  .mockup-cast {
    max-width: 380px;
    margin: 0 auto;
  }
  .mc-head {
    font-family: var(--font-display);
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--color-plum);
    letter-spacing: 0.05em;
    margin-bottom: var(--space-3);
    padding-bottom: var(--space-3);
    border-bottom: 1px solid var(--color-border);
  }
  .mc-count {
    color: var(--color-text-muted);
    font-weight: 500;
    margin-left: 6px;
    font-family: var(--font-ui);
    letter-spacing: 0;
  }
  .mc-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-bottom: var(--space-4);
  }
  .mc-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: 6px 8px;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--color-text);
  }
  .mc-row-warn {
    border-color: #fcd34d;
    background: #fffbeb;
    color: #92400e;
  }
  .mc-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .mc-char {
    margin-left: auto;
    font-size: 0.6875rem;
    font-weight: 500;
    color: var(--color-text-muted);
    font-style: italic;
  }
  .mc-row-warn .mc-char {
    color: #b45309;
  }
  .mc-groups {
    display: flex;
    gap: var(--space-2);
    padding-top: var(--space-3);
    border-top: 1px solid var(--color-border);
  }
  .mc-group {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    background: var(--color-bg-alt);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    padding: 4px 10px;
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--color-plum);
  }
  .mc-star {
    color: var(--color-teal);
  }

  /* --- Share-link mockup (looks like a browser window) --- */
  .mockup-share {
    padding: 0;
    background: transparent;
    border: none;
    box-shadow: none;
  }
  .ms-browser {
    background: var(--color-bg);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-lg);
    overflow: hidden;
  }
  .ms-browser-bar {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 12px;
    background: var(--color-bg-alt);
    border-bottom: 1px solid var(--color-border);
  }
  .ms-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--color-border-strong);
  }
  .ms-dot:nth-child(1) { background: #ff5f57; }
  .ms-dot:nth-child(2) { background: #febc2e; }
  .ms-dot:nth-child(3) { background: #28c840; }
  .ms-url {
    margin-left: 12px;
    padding: 3px 12px;
    background: var(--color-bg);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    font-family: var(--font-mono);
    font-size: 0.6875rem;
    color: var(--color-text-muted);
    flex: 1;
    max-width: 320px;
  }
  .ms-body {
    padding: var(--space-4);
  }
  .ms-header {
    display: flex;
    align-items: baseline;
    gap: var(--space-2);
    margin-bottom: var(--space-3);
  }
  .ms-show {
    font-family: var(--font-display);
    font-size: 1rem;
    font-weight: 600;
    color: var(--color-plum);
  }
  .ms-dates {
    font-size: 0.6875rem;
    color: var(--color-text-muted);
  }
  .ms-filter {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    background: var(--color-bg-alt);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    margin-bottom: var(--space-3);
    flex-wrap: wrap;
  }
  .ms-filter-label {
    font-size: 0.6875rem;
    font-weight: 600;
    color: var(--color-text-muted);
  }
  .ms-filter-select {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 4px 8px 4px 7px;
    background: var(--color-bg);
    border: 1px solid var(--color-border-strong);
    border-radius: var(--radius-sm);
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--color-text);
    box-shadow: var(--shadow-sm);
  }
  .ms-filter-dot {
    display: inline-block;
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }
  .ms-filter-count {
    font-size: 0.6875rem;
    font-weight: 600;
    color: var(--color-teal);
    padding: 3px 10px;
    background: rgba(56, 129, 125, 0.1);
    border-radius: var(--radius-full);
    margin-left: auto;
  }
  .ms-grid {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 3px;
  }
  .ms-cell {
    min-height: 44px;
    border: 1px solid var(--color-border);
    border-radius: 3px;
    padding: 3px 4px;
    background: var(--color-bg);
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-size: 0.5rem;
  }
  .ms-cell.ms-called {
    border-left: 3px solid var(--color-teal);
    background: rgba(56, 129, 125, 0.06);
  }
  .ms-cell.ms-muted {
    opacity: 0.25;
  }
  .ms-num {
    font-size: 0.5625rem;
    font-weight: 600;
    color: var(--color-plum);
  }
  .ms-mini {
    font-size: 0.5rem;
    font-weight: 700;
    color: #059669;
  }

  .feature-subtext {
    font-family: var(--font-ui);
    font-size: 0.8125rem;
    line-height: 1.5;
    color: var(--color-text-subtle);
    font-style: italic;
    margin: var(--space-4) 0 0 0;
    padding-top: var(--space-3);
    border-top: 1px dashed var(--color-border);
  }

  /* ==================== CLOSING CTA ==================== */
  .closing {
    position: relative;
    background: var(--color-plum-dark);
    padding: var(--space-8) 0;
    overflow: hidden;
    margin-top: var(--space-7);
  }

  .closing-glow {
    position: absolute;
    inset: 0;
    background: radial-gradient(
      ellipse at 50% 50%,
      rgba(56, 129, 125, 0.25) 0%,
      rgba(56, 129, 125, 0.08) 30%,
      transparent 60%
    );
    pointer-events: none;
  }

  .closing-inner {
    position: relative;
    max-width: 760px;
    margin: 0 auto;
    padding: 0 var(--space-5);
    text-align: center;
  }

  .closing-eyebrow {
    font-family: var(--font-display);
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--color-teal-light);
    margin: 0 0 var(--space-4) 0;
  }

  .closing-title {
    font-family: var(--font-display);
    font-size: clamp(2rem, 4.5vw, 3.25rem);
    line-height: 1.1;
    font-weight: 500;
    letter-spacing: -0.015em;
    color: var(--color-text-inverse);
    margin: 0 0 var(--space-6) 0;
  }

  .closing-actions {
    display: flex;
    gap: var(--space-3);
    justify-content: center;
    flex-wrap: wrap;
    margin-bottom: var(--space-4);
  }
  .closing-actions :global(.btn) {
    font-family: var(--font-display);
    font-weight: 500;
  }

  .closing-note {
    color: var(--color-text-subtle);
    font-size: 0.8125rem;
    margin: 0;
  }

  .notify-link {
    display: inline-block;
    margin-top: var(--space-3);
    font: inherit;
    font-size: 0.8125rem;
    background: transparent;
    border: none;
    color: var(--color-teal);
    text-decoration: underline;
    text-underline-offset: 3px;
    cursor: pointer;
    padding: var(--space-1) var(--space-2);
  }
  .notify-link:hover {
    color: var(--color-plum);
  }

  /* ==================== KEYFRAMES ==================== */
  @keyframes word-in {
    from {
      opacity: 0;
      transform: translateY(14px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @keyframes reel-in {
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .hero-title .line,
    .reel-chip,
    .preview-card .p-day-focus .a-badge,
    .preview-card .p-day-focus .a-time,
    .preview-card .p-day-focus .a-chip-marcus,
    .preview-card .p-day-focus .a-chip-ava,
    .preview-card .p-day-focus .a-desc,
    .preview-card .p-day-focus .a-location,
    .preview-card .p-day-tue-anim .tu-dark,
    .preview-card .p-day-focus-2 .b-badge,
    .preview-card .p-day-focus-2 .b-time,
    .preview-card .p-day-focus-2 .b-chip-sam,
    .preview-card .p-day-focus-2 .b-chip-riley,
    .preview-card .p-day-focus-2 .b-desc,
    .preview-card .p-day-focus-2 .b-location {
      animation: none;
      opacity: 1;
      transform: none;
      transition: none;
    }
    .flying-chip {
      animation: none;
      opacity: 0;
    }
  }

  /* ==================== RESPONSIVE ==================== */
  @media (max-width: 960px) {
    /* Mobile: hero stacks naturally. Loop animation still plays
       (without the flying chips - they're hidden below). */
    .hero {
      min-height: 0;
      display: block;
      padding: var(--space-6) 0 var(--space-7);
    }
    /* Hide the flying chip entirely on mobile since there's no animation */
    .flying-chip {
      display: none;
    }

    .hero-grid {
      grid-template-columns: 1fr;
      gap: var(--space-7);
    }
    .hero-copy {
      max-width: none;
    }
    .preview-card {
      transform: rotate(-0.8deg);
    }
    .preview-week {
      grid-template-columns: repeat(5, minmax(0, 1fr));
    }
    .p-day {
      min-height: 140px;
    }

    .feature-row,
    .feature-row-rev {
      grid-template-columns: 1fr;
      gap: var(--space-6);
    }
    .feature-row-rev .feature-copy { order: 1; }
    .feature-row-rev .feature-mockup { order: 2; }
    .feature-copy {
      max-width: none;
    }
  }

  @media (max-width: 640px) {
    .hero {
      padding: var(--space-6) 0 var(--space-7);
    }
    .hero-title {
      font-size: clamp(2rem, 8vw, 2.75rem);
    }
    .hero-lede {
      font-size: 1rem;
    }
    .preview-week {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
    .preview-week .p-day:nth-child(4),
    .preview-week .p-day:nth-child(5) {
      display: none;
    }
    .cast-reel-inner {
      flex-direction: column;
      align-items: flex-start;
    }
    .mockup-month .mm-grid {
      gap: 2px;
    }
  }
</style>
