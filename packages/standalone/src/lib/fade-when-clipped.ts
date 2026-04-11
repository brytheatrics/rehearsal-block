/**
 * Svelte action that watches a text element for horizontal overflow
 * and toggles an `is-overflowing` class on its closest chip ancestor.
 * Used by CastChip, GroupChip, and the sidebar crew chip so the fade
 * gradient overlay only renders when the inner text is actually being
 * clipped (otherwise the chip stays clean with no fade artifacts on
 * its right edge).
 *
 * Detection is the standard `scrollWidth > clientWidth` test:
 *   - When the element's content fits within its visible width, the
 *     two values are equal and we mark the chip as NOT overflowing.
 *   - When the content is wider (text-overflow:ellipsis kicks in),
 *     scrollWidth exceeds clientWidth and we mark the chip as
 *     overflowing.
 *
 * The +0.5 tolerance avoids false positives from sub-pixel rounding
 * (we've seen scrollWidth = 100.4 vs clientWidth = 100 on a chip
 * that visually fits perfectly).
 *
 * Usage:
 *   <span class="chip-character" use:fadeWhenClipped>...</span>
 *
 * The action walks up to the nearest .chip / .group-chip /
 * .crew-chip-sidebar ancestor and toggles `is-overflowing` on it.
 * CSS rules of the form `.chip.is-overflowing::after { ... }` then
 * conditionally show the fade overlay.
 *
 * A single ResizeObserver per element handles window resizes, font
 * size changes, sidebar collapses, etc. Cost is negligible (well
 * under 1KB total RAM for hundreds of chips).
 */
const CHIP_SELECTORS = ".chip, .group-chip, .crew-chip-sidebar";

export function fadeWhenClipped(node: HTMLElement) {
  const chip = node.closest(CHIP_SELECTORS);
  if (!chip) return {};

  function check() {
    const isOverflowing = node.scrollWidth > node.clientWidth + 0.5;
    chip!.classList.toggle("is-overflowing", isOverflowing);
  }

  check();

  const ro = new ResizeObserver(check);
  ro.observe(node);
  ro.observe(chip);

  return {
    destroy() {
      ro.disconnect();
    },
  };
}
