<script lang="ts">
  /**
   * Single contextual hint - tooltip with an arrow pointing at a target
   * element. Non-blocking (no backdrop dim), so the user can actually
   * click the thing being pointed at. Auto-closes when the target
   * disappears or when a parent-provided `closeWhen` signal flips true.
   *
   * This replaces the old spotlight-modal approach. Rationale: Blake
   * wanted the onboarding to *follow* the user through real setup
   * rather than forcing them to watch a tutorial and then remember.
   * Clippy-style helper, not Stripe-style linear tour.
   *
   * Plan: ~/.claude/plans/onboarding-tour.md (v2 design notes inline).
   */
  import { onMount } from "svelte";

  interface Props {
    /** CSS selector for the element the arrow points at (or highlights
     *  when mode === "highlight"). */
    target: string;
    /** Short description of what the user should do. */
    body: string;
    /** Optional title - rendered above body. */
    title?: string;
    /** Where to place the hint relative to the target. Auto picks the side
     *  with the most room. Ignored when mode === "highlight". */
    placement?: "top" | "bottom" | "left" | "right" | "auto";
    /** Presentation mode:
     *   - "pointer" (default): popover with arrow, anchored next to target.
     *     Used from empty-state pages where there's no surrounding
     *     container to dock the hint into.
     *   - "banner": target gets a plum glow ring; the hint renders INLINE
     *     as a banner wherever the parent places this component in the
     *     markup. Meant for modal/tab contexts where the parent can put
     *     the hint at the top of the container so it's always visible
     *     without covering the form below. */
    mode?: "pointer" | "banner";
    /** When true, the hint closes itself. Use to auto-advance when the
     *  user takes the expected action (e.g. opens a modal, clicks a tab). */
    closeWhen?: boolean;
    /** When true, attach a click listener to the target element and
     *  close the hint when the target is clicked. Lets the hint
     *  auto-advance on the user's natural action (clicking a tab,
     *  pressing a button) without parent components having to observe
     *  internal state from child components. */
    advanceOnClick?: boolean;
    /** Fired when the hint closes (either via Got it, auto-close, or
     *  target disappearing). Parent should mark the hint as completed. */
    onclose: () => void;
  }

  const {
    target,
    body,
    title,
    placement = "auto",
    mode = "pointer",
    closeWhen = false,
    advanceOnClick = false,
    onclose,
  }: Props = $props();

  /* Target measurement. Re-computed on step-change, resize, scroll. */
  let rect = $state<DOMRect | null>(null);
  let effectivePlacement = $state<"top" | "bottom" | "left" | "right">("bottom");
  /* Actual measured height of the hint element after render - used for
     accurate positioning on narrow viewports where the body wraps to
     more lines than the fixed estimate assumed. */
  let hintEl: HTMLDivElement | undefined = $state();
  let hintHeight = $state(140);

  /* Popover sizing - width is stable, height is re-measured after render
     since the body can wrap to 2-3 lines depending on viewport width. */
  const HINT_WIDTH = 280;
  const GAP = 14; // distance between target and popover (leaves room for arrow)
  const EDGE_MARGIN = 12;

  function measureTarget() {
    const el = document.querySelector(target);
    if (!el) {
      rect = null;
      return;
    }
    rect = el.getBoundingClientRect();
    effectivePlacement = chooseSide(rect, placement);
    /* Re-measure the hint height on next tick once it renders. Lets
       the positioning math use the real height when the body wraps to
       more lines than the default assumption on narrow viewports. */
    setTimeout(() => {
      if (hintEl) {
        const h = hintEl.getBoundingClientRect().height;
        if (h > 0 && Math.abs(h - hintHeight) > 2) {
          hintHeight = h;
        }
      }
    }, 0);
  }

  function chooseSide(r: DOMRect, pref: Props["placement"]): "top" | "bottom" | "left" | "right" {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const roomBottom = vh - r.bottom;
    const roomTop = r.top;
    const roomRight = vw - r.right;
    const roomLeft = r.left;

    if (pref && pref !== "auto") {
      /* Honor preference unless it clearly won't fit. */
      const room = pref === "top" ? roomTop : pref === "bottom" ? roomBottom : pref === "left" ? roomLeft : roomRight;
      const need = pref === "top" || pref === "bottom" ? hintHeight + GAP : HINT_WIDTH + GAP;
      if (room >= need) return pref;
    }
    /* Auto: pick the side with the most room. Prefer bottom/top since
       vertical arrows read more naturally than horizontal ones. */
    const vertical = Math.max(roomBottom, roomTop);
    const horizontal = Math.max(roomLeft, roomRight);
    if (vertical >= horizontal) {
      return roomBottom >= roomTop ? "bottom" : "top";
    }
    return roomRight >= roomLeft ? "right" : "left";
  }

  /* Popover position, derived from rect + effectivePlacement. */
  const popoverStyle = $derived.by(() => {
    if (!rect) return "";
    const r = rect;
    const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
    const vh = typeof window !== "undefined" ? window.innerHeight : 800;
    let top = 0;
    let left = 0;
    if (effectivePlacement === "bottom") {
      top = r.bottom + GAP;
      left = r.left + r.width / 2 - HINT_WIDTH / 2;
    } else if (effectivePlacement === "top") {
      top = r.top - hintHeight - GAP;
      left = r.left + r.width / 2 - HINT_WIDTH / 2;
    } else if (effectivePlacement === "right") {
      top = r.top + r.height / 2 - hintHeight / 2;
      left = r.right + GAP;
    } else {
      top = r.top + r.height / 2 - hintHeight / 2;
      left = r.left - HINT_WIDTH - GAP;
    }
    left = Math.max(EDGE_MARGIN, Math.min(vw - HINT_WIDTH - EDGE_MARGIN, left));
    top = Math.max(EDGE_MARGIN, Math.min(vh - hintHeight - EDGE_MARGIN, top));
    return `top:${top}px;left:${left}px;`;
  });

  /* Arrow (tail) position. Sits at the edge of the popover facing the
     target. Offset horizontally/vertically so it points at the target's
     midpoint when the target isn't centered relative to the popover. */
  const arrowStyle = $derived.by(() => {
    if (!rect) return "display:none;";
    const r = rect;
    const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
    const vh = typeof window !== "undefined" ? window.innerHeight : 800;
    let popoverLeft = r.left + r.width / 2 - HINT_WIDTH / 2;
    let popoverTop = r.top + r.height / 2 - hintHeight / 2;
    if (effectivePlacement === "bottom") popoverTop = r.bottom + GAP;
    else if (effectivePlacement === "top") popoverTop = r.top - hintHeight - GAP;
    else if (effectivePlacement === "right") popoverLeft = r.right + GAP;
    else if (effectivePlacement === "left") popoverLeft = r.left - HINT_WIDTH - GAP;
    popoverLeft = Math.max(EDGE_MARGIN, Math.min(vw - HINT_WIDTH - EDGE_MARGIN, popoverLeft));
    popoverTop = Math.max(EDGE_MARGIN, Math.min(vh - hintHeight - EDGE_MARGIN, popoverTop));

    const targetCenterX = r.left + r.width / 2;
    const targetCenterY = r.top + r.height / 2;
    /* Arrow anchored to the popover edge facing the target. */
    if (effectivePlacement === "bottom") {
      const x = Math.max(14, Math.min(HINT_WIDTH - 14, targetCenterX - popoverLeft));
      return `top:-7px;left:${x - 7}px;transform:rotate(180deg);`;
    }
    if (effectivePlacement === "top") {
      const x = Math.max(14, Math.min(HINT_WIDTH - 14, targetCenterX - popoverLeft));
      return `bottom:-7px;left:${x - 7}px;`;
    }
    if (effectivePlacement === "right") {
      const y = Math.max(14, Math.min(hintHeight - 14, targetCenterY - popoverTop));
      return `left:-7px;top:${y - 7}px;transform:rotate(90deg);`;
    }
    /* left */
    const y = Math.max(14, Math.min(hintHeight - 14, targetCenterY - popoverTop));
    return `right:-7px;top:${y - 7}px;transform:rotate(-90deg);`;
  });

  /* Auto-close on signal. */
  $effect(() => {
    if (closeWhen) {
      onclose();
    }
  });

  onMount(() => {
    /* Defer a tick to let the target element paint before measuring.
       Prefer setTimeout over requestAnimationFrame since RAF is
       throttled/paused in background tabs which could leave the hint
       invisible until the user focuses the tab. */
    setTimeout(() => {
      measureTarget();
      /* Second pass covers late-paint targets (fonts loaded, etc) so
         the arrow lands in the right place. */
      setTimeout(measureTarget, 50);
    }, 0);

    /* advanceOnClick: wire a delegated click listener on window that
       advances the tour when the target element (or its child) is
       clicked. Delegated (not directly on the target) so we don't fight
       Svelte's event bindings and so the listener auto-applies when the
       target re-mounts. Fires onclose, parent handles the transition. */
    let onWindowClick: ((e: MouseEvent) => void) | null = null;
    if (advanceOnClick) {
      onWindowClick = (e: MouseEvent) => {
        const path = e.composedPath() as Element[];
        for (const node of path) {
          if (node && node.matches && node.matches(target)) {
            onclose();
            return;
          }
        }
      };
      window.addEventListener("click", onWindowClick, true);
    }
    const onResize = () => measureTarget();
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onResize, true);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onResize, true);
      if (onWindowClick) {
        window.removeEventListener("click", onWindowClick, true);
      }
    };
  });
</script>

<!--
  Highlight ring renders in BOTH modes - the whole point is to help the
  user navigate, so every hint should call attention to its target
  element regardless of whether the hint itself is a pointer popover
  or an inline banner.
-->
{#if rect}
  <div
    class="highlight-ring"
    style:top="{rect.top - 4}px"
    style:left="{rect.left - 4}px"
    style:width="{rect.width + 8}px"
    style:height="{rect.height + 8}px"
    aria-hidden="true"
  ></div>
{/if}

{#if mode === "banner"}
  <!--
    Banner renders INLINE where the parent placed this component - the
    parent is expected to drop <OnboardingHint> at the top of a
    modal/panel so the banner appears as a full-width strip above the
    content.
  -->
  <div class="hint hint-inline-banner" role="status" aria-live="polite" bind:this={hintEl}>
    <div class="hint-content">
      {#if title}
        <h4 class="hint-title">{title}</h4>
      {/if}
      <p class="hint-body">{body}</p>
    </div>
    <button type="button" class="hint-close" onclick={onclose} aria-label="Dismiss hint">
      Got it
    </button>
  </div>
{:else if rect}
  <div
    class="hint"
    style={popoverStyle}
    role="status"
    aria-live="polite"
    bind:this={hintEl}
  >
    <!-- Arrow/tail pointing at the target. Rotated depending on placement. -->
    <span class="hint-arrow" style={arrowStyle} aria-hidden="true"></span>
    {#if title}
      <h4 class="hint-title">{title}</h4>
    {/if}
    <p class="hint-body">{body}</p>
    <button type="button" class="hint-close" onclick={onclose} aria-label="Dismiss hint">
      Got it
    </button>
  </div>
{/if}

<style>
  .hint {
    position: fixed;
    width: 280px;
    background: var(--color-plum);
    color: #fff;
    padding: var(--space-3) var(--space-4) var(--space-3);
    border-radius: var(--radius-md);
    box-shadow: 0 10px 30px rgba(45, 31, 61, 0.35);
    z-index: 5000;
    animation: hint-in 180ms ease-out;
  }

  @keyframes hint-in {
    from {
      opacity: 0;
      transform: scale(0.96);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }

  .hint-arrow {
    /* Triangle pointing UP by default. Rotated by placement. */
    position: absolute;
    width: 14px;
    height: 14px;
    background: var(--color-plum);
    clip-path: polygon(50% 0, 100% 100%, 0 100%);
  }

  .hint-title {
    font-size: 0.875rem;
    font-weight: 700;
    margin: 0 0 var(--space-1);
    color: #fff;
  }

  .hint-body {
    font-size: 0.875rem;
    line-height: 1.5;
    margin: 0 0 var(--space-2);
    color: #fff;
    opacity: 0.95;
  }

  .hint-close {
    font: inherit;
    font-size: 0.75rem;
    font-weight: 600;
    background: rgba(255, 255, 255, 0.15);
    border: none;
    color: #fff;
    padding: var(--space-1) var(--space-3);
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: background var(--transition-fast);
  }
  .hint-close:hover {
    background: rgba(255, 255, 255, 0.25);
  }

  /* Highlight mode: plum ring around the target element + hint docked
     at the bottom of the viewport. Matches the popover's plum color so
     it reads as a single design language. */
  .highlight-ring {
    position: fixed;
    border: 2px solid var(--color-plum);
    border-radius: 6px;
    box-shadow: 0 0 0 4px rgba(45, 31, 61, 0.2), 0 0 18px rgba(45, 31, 61, 0.35);
    pointer-events: none;
    z-index: 5001;
    transition: top 160ms ease, left 160ms ease, width 160ms ease, height 160ms ease;
    animation: highlight-pulse 2.4s ease-in-out infinite;
  }
  @keyframes highlight-pulse {
    0%, 100% {
      box-shadow: 0 0 0 4px rgba(45, 31, 61, 0.2), 0 0 18px rgba(45, 31, 61, 0.35);
    }
    50% {
      box-shadow: 0 0 0 6px rgba(45, 31, 61, 0.3), 0 0 24px rgba(45, 31, 61, 0.5);
    }
  }

  /* Inline banner. No fixed positioning - flows with the parent
     container so the caller controls placement (typically the top of
     a modal or tab panel). Full width of its parent. */
  .hint-inline-banner {
    position: static;
    width: auto;
    max-width: none;
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-2) var(--space-4);
    border-radius: 0;
    box-shadow: none;
    animation: hint-inline-in 180ms ease-out;
  }
  @keyframes hint-inline-in {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
  .hint-content {
    flex: 1;
    min-width: 0;
  }
  .hint-inline-banner .hint-title {
    margin-bottom: 0;
    font-size: 0.8125rem;
  }
  .hint-inline-banner .hint-body {
    margin-bottom: 0;
    font-size: 0.8125rem;
    line-height: 1.4;
  }

  /* Mobile: keep same width as desktop so the positioning math (which
     uses a fixed HINT_WIDTH constant) lines up the arrow correctly.
     280px fits on iPhone SE-class screens with room to spare. */
  @media (max-width: 640px) {
    .hint {
      padding: var(--space-2) var(--space-3);
    }
    .hint-body {
      font-size: 0.8125rem;
    }
  }
</style>
