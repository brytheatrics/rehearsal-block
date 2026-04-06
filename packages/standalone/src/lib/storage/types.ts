/**
 * Storage abstraction for rehearsal schedule documents.
 *
 * The app reads/writes schedule data through this interface, not directly
 * through Supabase or localStorage. That means we can swap the underlying
 * storage implementation (demo / local / cloud / offline-sync) without
 * touching feature code.
 *
 * Three implementations live alongside this file:
 * - demo.ts: in-memory, read-only sample show. Writes throw a "Buy to unlock" error.
 * - local.ts: localStorage for anonymous or offline users. (Stub - fill in next session.)
 * - supabase.ts: Supabase Postgres for signed-in paid users. (Stub - fill in next session.)
 *
 * And an index.ts that picks the right implementation based on the current
 * user state.
 */

import type { ScheduleDoc } from "@rehearsal-block/core";

export interface StoredShow {
  id: string;
  name: string;
  updatedAt: string;
  document: ScheduleDoc;
}

export interface ShowStorage {
  /** Return a list of all shows the current user can access. */
  listShows(): Promise<StoredShow[]>;

  /** Load a single show by ID. Returns null if not found. */
  loadShow(id: string): Promise<StoredShow | null>;

  /** Create or update a show. Returns the saved record. */
  saveShow(show: StoredShow): Promise<StoredShow>;

  /** Delete a show by ID. */
  deleteShow(id: string): Promise<void>;

  /** True if this storage backend allows writes. Demo returns false. */
  readonly canWrite: boolean;
}

/** Thrown by demo storage when a write is attempted. UI should show a paywall modal. */
export class PaywallError extends Error {
  constructor() {
    super("This action requires a paid account. Buy Rehearsal Block to save, export, and create your own shows.");
    this.name = "PaywallError";
  }
}
