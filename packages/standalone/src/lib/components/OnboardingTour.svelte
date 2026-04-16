<script lang="ts">
  /**
   * Coachmark-style onboarding tour.
   *
   * Renders a semi-transparent backdrop that dims the entire page except
   * for a "spotlight" cutout over the current step's target element. A
   * floating popover sits next to the spotlight and walks the user
   * through Next/Skip/Got-it. Steps with no target render as a centered
   * modal card (same popover, no spotlight, no cutout).
   *
   * The whole tree is fixed-position over the viewport so it escapes any
   * parent modal's stacking context - tours triggered from inside a
   * modal (e.g. NewShowModal) still paint on top.
   *
   * Blake's plan: ~/.claude/plans/onboarding-tour.md. This is the v1
   * implementation - Tour 1 only. Tours 2/3 reuse this component.
   */
  import { onMount, onDestroy } from "svelte";

  export interface TourStep {
    /** CSS selector for the element to spotlight. null = centered card,
     *  no cutout (e.g. welcome / wrap-up steps). */
    target: string | null;
    title: string;
    body: string;
    /** Which side of the target to attach the popover. Auto flips if
     *  the chosen side would push the popover off-screen. Default "auto". */
    placement?: "top" | "bottom" | "left" | "right" | "auto";
  }

  interface Props {
    tourId: string;
    steps: TourStep[];
    /** Fired when the user completes all steps (Got it) OR skips. Parent
     *  is responsible for persisting `completed[tourId] = true`. */
    oncomplete: () => void;
    /** Fired when the user explicitly dismisses without finishing. Parent
     *  may choose to persist completion (don't show again) or not. By
     *  default we still call oncomplete from dismiss - parent decides. */
    ondismiss?: () => void;
  }

  const { tourId, steps, oncomplete, ondismiss }: Props = $props();

  let currentIndex = $state(0);
  const step = $derived(steps[currentIndex] ?? null);
  const isLast = $derived(currentIndex === steps.length - 1);

  /* Target element measurements, re-computed whenever the step changes
     or the window resizes. null means "show as centered card". */
  let rect = $state<DOMRect | null>(null);
  let popoverPos = $state<{ top: number; left: number; placement: "top" | "bottom" | "left" | "right" | "center" }>({
    top: 0,
    left: 0,
    placement: "center",
  });

  /* Bounding box of the spotlight - slightly padded around the target
     so the highlight doesn't hug pixel-perfectly (looks nicer). */
  const SPOTLIGHT_PAD = 6;
  /* Popover offset from the target edge. */
  const POPOVER_GAP = 12;
  /* Popover dimensions (must match the CSS below). */
  const POPOVER_WIDTH = 340;
  const POPOVER_HEIGHT_EST = 180; // estimate for offscreen checks

  function measureTarget() {
    if (!step) return;
    if (!step.target) {
      rect = null;
      popoverPos = { top: 0, left: 0, placement: "center" };
      return;
    }
    const el = document.querySelector(step.target);
    if (!el) {
      rect = null;
      popoverPos = { top: 0, left: 0, placement: "center" };
      return;
    }
    const r = el.getBoundingClientRect();
    rect = r;
    popoverPos = computePopoverPosition(r, step.placement ?? "auto");
  }

  function computePopoverPosition(
    r: DOMRect,
    pref: "top" | "bottom" | "left" | "right" | "auto",
  ): { top: number; left: number; placement: "top" | "bottom" | "left" | "right" | "center" } {
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    /* Auto-choose: prefer bottom if there's room, then top, then right,
       then left. Fall back to centered if nothing fits. */
    const order: Array<"bottom" | "top" | "right" | "left"> =
      pref === "auto"
        ? ["bottom", "top", "right", "left"]
        : [pref, ...(["bottom", "top", "right", "left"] as const).filter((p) => p !== pref)];

    for (const placement of order) {
      const candidate = tryPlacement(r, placement, vw, vh);
      if (candidate) return { ...candidate, placement };
    }

    /* Fallback: center-of-viewport. */
    return {
      top: Math.max(0, vh / 2 - POPOVER_HEIGHT_EST / 2),
      left: Math.max(0, vw / 2 - POPOVER_WIDTH / 2),
      placement: "center",
    };
  }

  function tryPlacement(
    r: DOMRect,
    placement: "top" | "bottom" | "left" | "right",
    vw: number,
    vh: number,
  ): { top: number; left: number } | null {
    let top = 0;
    let left = 0;

    if (placement === "bottom") {
      top = r.bottom + POPOVER_GAP;
      left = r.left + r.width / 2 - POPOVER_WIDTH / 2;
      if (top + POPOVER_HEIGHT_EST > vh - 16) return null;
    } else if (placement === "top") {
      top = r.top - POPOVER_HEIGHT_EST - POPOVER_GAP;
      left = r.left + r.width / 2 - POPOVER_WIDTH / 2;
      if (top < 16) return null;
    } else if (placement === "right") {
      top = r.top + r.height / 2 - POPOVER_HEIGHT_EST / 2;
      left = r.right + POPOVER_GAP;
      if (left + POPOVER_WIDTH > vw - 16) return null;
    } else {
      top = r.top + r.height / 2 - POPOVER_HEIGHT_EST / 2;
      left = r.left - POPOVER_WIDTH - POPOVER_GAP;
      if (left < 16) return null;
    }

    /* Clamp to viewport margins. */
    left = Math.max(16, Math.min(vw - POPOVER_WIDTH - 16, left));
    top = Math.max(16, Math.min(vh - POPOVER_HEIGHT_EST - 16, top));
    return { top, left };
  }

  /* Re-measure whenever step changes. We also set up resize + scroll
     listeners on mount to track layout shifts. */
  $effect(() => {
    if (!step) return;
    /* Defer one frame so the target element has time to render (e.g.
       when the tour starts immediately after mount and the target is
       inside a just-mounted component). */
    requestAnimationFrame(() => {
      measureTarget();
      /* Second pass after the initial frame - covers cases where the
         target element gains its final size after first paint
         (fonts, images, etc). */
      setTimeout(measureTarget, 50);
    });
  });

  function onKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      skip();
    } else if (e.key === "Enter" || e.key === "ArrowRight") {
      e.preventDefault();
      next();
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      back();
    }
  }

  onMount(() => {
    const onResize = () => measureTarget();
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onResize, true);
    window.addEventListener("keydown", onKeydown);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onResize, true);
      window.removeEventListener("keydown", onKeydown);
    };
  });

  function next() {
    if (isLast) {
      finish();
    } else {
      currentIndex += 1;
    }
  }

  function back() {
    if (currentIndex > 0) currentIndex -= 1;
  }

  function skip() {
    if (ondismiss) ondismiss();
    else oncomplete();
  }

  function finish() {
    oncomplete();
  }
</script>

{#if step}
  <!--
    Backdrop: a full-viewport SVG that masks out the spotlight rect so the
    rest of the page dims uniformly. Using SVG avoids the "four divs
    surrounding the target" hack which doesn't animate nicely.
  -->
  <svg
    class="tour-backdrop"
    role="presentation"
    aria-hidden="true"
    xmlns="http://www.w3.org/2000/svg"
  >
    <defs>
      <mask id="tour-mask-{tourId}">
        <rect width="100%" height="100%" fill="white" />
        {#if rect}
          <rect
            x={rect.left - SPOTLIGHT_PAD}
            y={rect.top - SPOTLIGHT_PAD}
            width={rect.width + SPOTLIGHT_PAD * 2}
            height={rect.height + SPOTLIGHT_PAD * 2}
            rx="8"
            ry="8"
            fill="black"
          />
        {/if}
      </mask>
    </defs>
    <rect
      width="100%"
      height="100%"
      fill="rgba(45, 31, 61, 0.6)"
      mask="url(#tour-mask-{tourId})"
    />
  </svg>

  <!--
    Spotlight border ring - purely visual. Painted on top of the backdrop
    so the highlighted element gets a subtle teal outline. Separate from
    the mask since the mask uses black-and-white for visibility math.
  -->
  {#if rect}
    <div
      class="tour-spotlight-ring"
      style:top="{rect.top - SPOTLIGHT_PAD}px"
      style:left="{rect.left - SPOTLIGHT_PAD}px"
      style:width="{rect.width + SPOTLIGHT_PAD * 2}px"
      style:height="{rect.height + SPOTLIGHT_PAD * 2}px"
    ></div>
  {/if}

  <!--
    Popover card. Positioned absolutely in the viewport. Content + actions.
  -->
  <div
    class="tour-popover"
    class:centered={popoverPos.placement === "center" || !rect}
    style:top={rect ? `${popoverPos.top}px` : undefined}
    style:left={rect ? `${popoverPos.left}px` : undefined}
    role="dialog"
    aria-modal="true"
    aria-labelledby="tour-title-{tourId}"
  >
    <div class="tour-step-indicator">
      Step {currentIndex + 1} of {steps.length}
    </div>
    <h3 id="tour-title-{tourId}">{step.title}</h3>
    <p>{step.body}</p>
    <div class="tour-actions">
      <button type="button" class="tour-skip" onclick={skip}>
        Skip tour
      </button>
      <div class="tour-nav">
        {#if currentIndex > 0}
          <button type="button" class="tour-back" onclick={back}>Back</button>
        {/if}
        <button type="button" class="tour-next" onclick={next}>
          {isLast ? "Got it" : "Next"}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  /* Full-viewport SVG mask. Pointer events pass through the spotlight
     cutout to the real UI below, but the dim backdrop blocks clicks on
     everything else so the user can't accidentally click outside the
     tour flow. */
  .tour-backdrop {
    position: fixed;
    inset: 0;
    width: 100vw;
    height: 100vh;
    z-index: 5000;
    pointer-events: auto;
  }

  .tour-spotlight-ring {
    position: fixed;
    border: 2px solid var(--color-teal);
    border-radius: 8px;
    box-shadow: 0 0 0 4px rgba(56, 129, 125, 0.3);
    z-index: 5001;
    pointer-events: none;
    transition: top 200ms ease, left 200ms ease, width 200ms ease, height 200ms ease;
  }

  .tour-popover {
    position: fixed;
    width: 340px;
    max-width: calc(100vw - 32px);
    background: var(--color-surface);
    border-radius: var(--radius-lg);
    box-shadow: 0 20px 40px rgba(45, 31, 61, 0.35);
    padding: var(--space-4) var(--space-5) var(--space-4);
    z-index: 5002;
    animation: tour-in 180ms ease-out;
  }

  .tour-popover.centered {
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
  }

  @keyframes tour-in {
    from {
      opacity: 0;
      transform: translateY(6px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .tour-popover.centered {
    animation: tour-in-centered 180ms ease-out;
  }

  @keyframes tour-in-centered {
    from {
      opacity: 0;
      transform: translate(-50%, calc(-50% + 6px));
    }
    to {
      opacity: 1;
      transform: translate(-50%, -50%);
    }
  }

  .tour-step-indicator {
    font-size: 0.6875rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--color-teal);
    margin-bottom: var(--space-2);
  }

  .tour-popover h3 {
    font-size: 1.0625rem;
    font-weight: 700;
    color: var(--color-plum);
    margin: 0 0 var(--space-2);
    line-height: 1.3;
  }

  .tour-popover p {
    font-size: 0.9375rem;
    color: var(--color-text);
    margin: 0 0 var(--space-4);
    line-height: 1.55;
  }

  .tour-actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
  }

  .tour-skip {
    font: inherit;
    font-size: 0.8125rem;
    background: transparent;
    border: none;
    color: var(--color-text-muted);
    cursor: pointer;
    padding: var(--space-2) 0;
    text-decoration: underline;
    text-underline-offset: 3px;
  }
  .tour-skip:hover {
    color: var(--color-text);
  }

  .tour-nav {
    display: flex;
    gap: var(--space-2);
  }

  .tour-back {
    font: inherit;
    font-size: 0.8125rem;
    padding: var(--space-2) var(--space-4);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--color-text);
    cursor: pointer;
  }
  .tour-back:hover {
    background: var(--color-bg-alt);
  }

  .tour-next {
    font: inherit;
    font-size: 0.8125rem;
    font-weight: 600;
    padding: var(--space-2) var(--space-4);
    border: none;
    border-radius: var(--radius-sm);
    background: var(--color-teal);
    color: #fff;
    cursor: pointer;
    transition: background var(--transition-fast);
  }
  .tour-next:hover {
    background: var(--color-teal-dark, #2e6b68);
  }

  /* Mobile: popover becomes a bottom sheet. Arrow-key nav still works. */
  @media (max-width: 640px) {
    .tour-popover,
    .tour-popover.centered {
      position: fixed;
      top: auto !important;
      left: 0 !important;
      right: 0;
      bottom: 0;
      width: auto;
      max-width: none;
      border-bottom-left-radius: 0;
      border-bottom-right-radius: 0;
      transform: none !important;
      animation: tour-in-mobile 200ms ease-out;
    }
    @keyframes tour-in-mobile {
      from {
        transform: translateY(100%) !important;
      }
      to {
        transform: translateY(0) !important;
      }
    }
  }
</style>
