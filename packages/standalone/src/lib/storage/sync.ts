/**
 * Local-first sync layer: IndexedDB (instant) + cloud push (idle-debounced).
 *
 * Write-through: saveShow writes IndexedDB immediately (instant). Cloud push
 * is idle-based - every edit clears the pending timer and schedules a new one
 * 60s in the future. Continuous editing pushes the timer out. Only fires once
 * the user has been idle for 60s.
 *
 * Hard flush events bypass the 60s idle wait: window blur, visibilitychange
 * hidden, beforeunload, pagehide, and explicit Ctrl+S.
 *
 * Gzip + hash guard: compress ScheduleDoc JSON with pako before the cloud
 * write. Skip if the hash matches the last synced hash.
 */

import pako from "pako";
import type { ScheduleDoc } from "@rehearsal-block/core";
import type { ShowStorage, StoredShow } from "./types.js";
import {
  localListShows,
  localLoadShow,
  localSaveShow,
  localDeleteShow,
  getSyncMeta,
  setSyncMeta,
} from "./local.js";
import { listShowsMeta, type ShowIndexRow } from "./supabase.js";
import type { SupabaseClient } from "@supabase/supabase-js";

export type SyncStatus = "synced" | "pending" | "syncing" | "error";

export interface SyncedStorage extends ShowStorage {
  /** Current sync status for a given show id. */
  getSyncStatus(showId: string): SyncStatus;

  /** Force an immediate flush of any pending cloud write for a show. */
  flush(showId: string): Promise<void>;

  /** Subscribe to sync status changes. Returns an unsubscribe function. */
  onSyncStatusChange(listener: (showId: string, status: SyncStatus) => void): () => void;

  /** Tear down timers and event listeners. */
  destroy(): void;
}

const IDLE_DEBOUNCE_MS = 60_000;

async function hashBytes(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function gzipDoc(doc: ScheduleDoc): Uint8Array<ArrayBuffer> {
  const json = JSON.stringify(doc);
  const raw = pako.gzip(json);
  // pako returns Uint8Array<ArrayBufferLike>; narrow to ArrayBuffer for strict TS
  return new Uint8Array(raw) as Uint8Array<ArrayBuffer>;
}

/**
 * Extract metadata from a ScheduleDoc for the shows_index row.
 */
function extractMeta(doc: ScheduleDoc) {
  return {
    name: doc.show.name,
    start_date: doc.show.startDate ?? null,
    end_date: doc.show.endDate ?? null,
    cast_count: doc.cast.length,
    doc_version: doc.version,
  };
}

export function createSyncedStorage(config: {
  userId: string;
  supabase: SupabaseClient;
}): SyncedStorage {
  const { userId, supabase } = config;

  const statusMap = new Map<string, SyncStatus>();
  const listeners = new Set<(showId: string, status: SyncStatus) => void>();
  const pendingTimers = new Map<string, ReturnType<typeof setTimeout>>();

  function setStatus(showId: string, status: SyncStatus) {
    statusMap.set(showId, status);
    for (const fn of listeners) {
      try {
        fn(showId, status);
      } catch {
        // listener errors don't break the sync layer
      }
    }
  }

  async function pushToCloud(showId: string): Promise<void> {
    const show = await localLoadShow(showId);
    if (!show) return;

    const gzipped = gzipDoc(show.document);
    const hash = await hashBytes(gzipped);

    // Hash guard: skip if unchanged since last sync
    const meta = await getSyncMeta(showId);
    if (meta.lastSyncedHash === hash) {
      setStatus(showId, "synced");
      return;
    }

    setStatus(showId, "syncing");

    try {
      const res = await fetch(`/api/shows/${showId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/gzip" },
        body: new Blob([gzipped], { type: "application/gzip" }),
      });

      if (res.status === 429) {
        // Rate limited - retry after a short delay
        setTimeout(() => schedulePush(showId, 10_000), 0);
        return;
      }

      if (!res.ok) {
        throw new Error(`Cloud save failed: ${res.status} ${res.statusText}`);
      }

      await setSyncMeta(showId, {
        lastSyncedHash: hash,
        lastSyncedAt: new Date().toISOString(),
      });
      setStatus(showId, "synced");
    } catch {
      setStatus(showId, "error");
    }
  }

  function schedulePush(showId: string, delayMs = IDLE_DEBOUNCE_MS) {
    // Clear any existing timer for this show
    const existing = pendingTimers.get(showId);
    if (existing) clearTimeout(existing);

    setStatus(showId, "pending");

    const timer = setTimeout(() => {
      pendingTimers.delete(showId);
      pushToCloud(showId);
    }, delayMs);

    pendingTimers.set(showId, timer);
  }

  async function flushShow(showId: string): Promise<void> {
    const existing = pendingTimers.get(showId);
    if (existing) {
      clearTimeout(existing);
      pendingTimers.delete(showId);
    }
    await pushToCloud(showId);
  }

  async function flushAll(): Promise<void> {
    const showIds = [...pendingTimers.keys()];
    for (const timer of pendingTimers.values()) clearTimeout(timer);
    pendingTimers.clear();
    await Promise.allSettled(showIds.map((id) => pushToCloud(id)));
  }

  // Hard flush events
  function onVisibilityChange() {
    if (document.visibilityState === "hidden") {
      flushAll();
    }
  }

  function onBlur() {
    flushAll();
  }

  function onBeforeUnload() {
    // Use sendBeacon for pending shows to survive tab close
    for (const showId of pendingTimers.keys()) {
      localLoadShow(showId).then((show) => {
        if (!show) return;
        const gzipped = gzipDoc(show.document);
        navigator.sendBeacon(`/api/shows/${showId}`, new Blob([gzipped], { type: "application/gzip" }));
      });
    }
  }

  function onOnline() {
    // Retry any shows in error state
    for (const [showId, status] of statusMap) {
      if (status === "error") {
        schedulePush(showId, 5_000);
      }
    }
  }

  if (typeof window !== "undefined") {
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("blur", onBlur);
    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener("online", onOnline);
  }

  const storage: SyncedStorage = {
    canWrite: true,

    async listShows(): Promise<StoredShow[]> {
      // Primary source: IndexedDB (instant)
      const localShows = await localListShows();

      // Background reconciliation with cloud metadata
      try {
        const cloudMeta = await listShowsMeta(supabase);
        const localIds = new Set(localShows.map((s) => s.id));

        // Find shows that exist in cloud but not locally (e.g. created on another device)
        const missingFromLocal = cloudMeta.filter((m) => !localIds.has(m.id));

        if (missingFromLocal.length > 0) {
          // Fetch full docs from cloud for shows we don't have locally
          const fetched = await Promise.allSettled(
            missingFromLocal.map(async (meta) => {
              const res = await fetch(`/api/shows/${meta.id}`);
              if (!res.ok) return null;
              const show: StoredShow = await res.json();
              await localSaveShow(show);
              return show;
            }),
          );

          for (const result of fetched) {
            if (result.status === "fulfilled" && result.value) {
              localShows.push(result.value);
            }
          }
        }
      } catch {
        // Cloud unavailable - local list is still valid
      }

      return localShows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    },

    async loadShow(id: string): Promise<StoredShow | null> {
      // Local first
      const local = await localLoadShow(id);
      if (local) return local;

      // Try cloud
      try {
        const res = await fetch(`/api/shows/${id}`);
        if (!res.ok) return null;
        const show: StoredShow = await res.json();
        await localSaveShow(show);
        return show;
      } catch {
        return null;
      }
    },

    async saveShow(show: StoredShow): Promise<StoredShow> {
      const saved: StoredShow = {
        ...show,
        updatedAt: new Date().toISOString(),
      };

      // Write-through: IndexedDB immediately
      await localSaveShow(saved);

      // Schedule idle-debounced cloud push
      schedulePush(saved.id);

      return saved;
    },

    async deleteShow(id: string): Promise<void> {
      // Cancel any pending sync
      const timer = pendingTimers.get(id);
      if (timer) {
        clearTimeout(timer);
        pendingTimers.delete(id);
      }
      statusMap.delete(id);

      // Delete locally
      await localDeleteShow(id);

      // Delete from cloud
      try {
        await fetch(`/api/shows/${id}`, { method: "DELETE" });
      } catch {
        // Best-effort cloud delete - local is already gone
      }
    },

    getSyncStatus(showId: string): SyncStatus {
      return statusMap.get(showId) ?? "synced";
    },

    async flush(showId: string): Promise<void> {
      await flushShow(showId);
    },

    onSyncStatusChange(listener: (showId: string, status: SyncStatus) => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    destroy() {
      // Clear all timers
      for (const timer of pendingTimers.values()) clearTimeout(timer);
      pendingTimers.clear();

      // Remove event listeners
      if (typeof window !== "undefined") {
        document.removeEventListener("visibilitychange", onVisibilityChange);
        window.removeEventListener("blur", onBlur);
        window.removeEventListener("beforeunload", onBeforeUnload);
        window.removeEventListener("online", onOnline);
      }
    },
  };

  return storage;
}
