/**
 * Storage factory: picks the right implementation based on context.
 *
 * - Demo mode (/demo): demoStorage (in-memory, read-only sample show)
 * - Paid user (/app): SyncedStorage (IndexedDB + R2 cloud sync)
 */

export { demoStorage, DEMO_SHOW_ID } from "./demo.js";
export { createSyncedStorage, type SyncedStorage, type SyncStatus } from "./sync.js";
export type { ShowStorage, StoredShow } from "./types.js";
export { PaywallError } from "./types.js";
export type { ShowIndexRow } from "./supabase.js";
export { listShowsMeta, getShowMeta } from "./supabase.js";
