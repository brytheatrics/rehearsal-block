/**
 * Local-first sync layer wrapping IndexedDB + R2 + Supabase metadata.
 *
 * STUB: to be implemented in Phase 1 of the paid version plan. See
 * `C:\Users\blake\.claude\plans\curious-cuddling-moth.md` "Phase 1 - Storage
 * foundation" section 5 for the full behavior spec.
 *
 * Behavior summary (what the real implementation must do):
 *
 * - Write-through: saveShow writes IndexedDB immediately (instant, synchronous).
 *   The user's work is always safe locally on every edit, independent of
 *   network state.
 *
 * - Cloud push is idle-based, not timer-based: every edit clears any pending
 *   save timer and schedules a new one 60 seconds in the future. Continuous
 *   editing keeps pushing the timer out. Only fires once the user has been
 *   idle for 60s. Real editing collapses ~60 naive writes into ~5 actual
 *   writes per 30-minute session.
 *
 * - Hard flush events bypass the 60s idle wait and push immediately:
 *   window.blur, visibilitychange -> hidden, beforeunload, pagehide,
 *   explicit Ctrl+S. The beforeunload flush uses navigator.sendBeacon so it
 *   survives a tab close.
 *
 * - Gzip on the wire: compress the ScheduleDoc JSON with pako.gzip before
 *   the R2 write. ~150KB doc compresses to ~15-30KB, 5-10x bandwidth reduction.
 *
 * - Hash guard: skip the cloud write if the current gzipped-doc hash equals
 *   the last successfully synced hash. No-op writes are dropped to protect
 *   Supabase + R2 free-tier budgets.
 *
 * - Write order on each flush: POST to /api/shows/[id] -> function writes to
 *   R2 -> function updates shows_index metadata row -> return 200. Retry on
 *   failure with exponential backoff, flush on `online` event.
 *
 * - Read-through: load from IndexedDB first (instant), reconcile with cloud
 *   on a background fetch (last-write-wins by updated_at). Only fetches from
 *   cloud on app open or explicit "refresh from cloud" action - never on
 *   every page view.
 *
 * - Multi-tab warning via BroadcastChannel: when another tab is editing the
 *   same show, show a non-blocking banner ("This show is open in another
 *   tab. Edits may overwrite each other.").
 *
 * - Exposes syncStatus per show: "synced" | "pending" | "syncing" | "error".
 */

import type { ShowStorage } from "./types.js";

export type SyncStatus = "synced" | "pending" | "syncing" | "error";

export interface SyncedStorage extends ShowStorage {
  /** Current sync status for a given show id. */
  getSyncStatus(showId: string): SyncStatus;

  /** Force an immediate flush of any pending cloud write for a show. */
  flush(showId: string): Promise<void>;

  /** Subscribe to sync status changes. Returns an unsubscribe function. */
  onSyncStatusChange(listener: (showId: string, status: SyncStatus) => void): () => void;
}

/**
 * Create a sync layer wrapping IndexedDB local storage with R2 + Supabase
 * cloud push. Stub - real implementation pending Phase 1.
 */
export function createSyncedStorage(_config: {
  userId: string;
  /** User's locale timezone for daily snapshot dating. */
  timezone: string;
}): SyncedStorage {
  throw new Error("Sync layer not yet implemented - see plans/curious-cuddling-moth.md Phase 1");
}
