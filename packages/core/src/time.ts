/**
 * Shared time formatting utility. Every time display in the app -
 * grid cells, editor pickers, collapsed summaries, curtain labels -
 * goes through this function so the 12h/24h setting is honored
 * consistently everywhere.
 */

/**
 * Format "HH:MM" (24-hour storage) for display.
 *
 * - "12h" mode: "7:00 PM", "12:30 AM"
 * - "24h" mode: "19:00", "00:30"
 *
 * Empty/invalid input returns "-".
 */
export function formatTime(
  hhmm: string,
  format: "12h" | "24h" = "12h",
): string {
  if (!hhmm) return "-";
  const [hStr, mStr] = hhmm.split(":");
  const h = Number(hStr);
  const m = Number(mStr);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return hhmm;

  if (format === "24h") {
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }

  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}
