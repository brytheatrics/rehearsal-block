/**
 * IndexedDB-backed local storage for show documents.
 *
 * This is the always-available local cache in the local-first architecture.
 * Writes are instant and synchronous (from the caller's perspective).
 * The sync layer (sync.ts) coordinates pushing changes to the cloud.
 *
 * Uses idb-keyval for a minimal IndexedDB wrapper. Two stores:
 * - "shows": full StoredShow records keyed by show id
 * - "meta": sync metadata (hashes, timestamps) keyed by show id
 */

import { createStore, get, set, del, keys, getMany, type UseStore } from "idb-keyval";
import type { StoredShow } from "./types.js";
import type { Settings, EventType, LocationPreset } from "@rehearsal-block/core";

const DB_NAME = "rehearsal-block";
const SHOWS_STORE = "shows";
const META_STORE = "meta";
const DEFAULTS_STORE = "defaults";

// Lazily initialized - idb-keyval's createStore calls indexedDB.open()
// which doesn't exist during SSR. Deferring to first use ensures we
// only touch IndexedDB in the browser.
let _showsStore: UseStore | undefined;
let _metaStore: UseStore | undefined;
let _defaultsStore: UseStore | undefined;

function showsStore(): UseStore {
  if (!_showsStore) _showsStore = createStore(DB_NAME, SHOWS_STORE);
  return _showsStore;
}

function metaStore(): UseStore {
  if (!_metaStore) _metaStore = createStore(`${DB_NAME}-meta`, META_STORE);
  return _metaStore;
}

function defaultsStore(): UseStore {
  if (!_defaultsStore) _defaultsStore = createStore(`${DB_NAME}-defaults`, DEFAULTS_STORE);
  return _defaultsStore;
}

export interface SyncMeta {
  /** SHA-256 hash of the last gzipped blob successfully synced to cloud. */
  lastSyncedHash: string | null;
  /** ISO timestamp of the last successful cloud sync. */
  lastSyncedAt: string | null;
}

// ---- Show CRUD (IndexedDB) ----

export async function localListShows(): Promise<StoredShow[]> {
  const allKeys = await keys<string>(showsStore());
  if (allKeys.length === 0) return [];
  const shows = await getMany<StoredShow>(allKeys, showsStore());
  return shows.filter(Boolean).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function localLoadShow(id: string): Promise<StoredShow | null> {
  const show = await get<StoredShow>(id, showsStore());
  return show ?? null;
}

export async function localSaveShow(show: StoredShow): Promise<StoredShow> {
  await set(show.id, show, showsStore());
  return show;
}

export async function localDeleteShow(id: string): Promise<void> {
  await del(id, showsStore());
  await del(id, metaStore());
}

// ---- Sync metadata ----

export async function getSyncMeta(showId: string): Promise<SyncMeta> {
  const meta = await get<SyncMeta>(showId, metaStore());
  return meta ?? { lastSyncedHash: null, lastSyncedAt: null };
}

export async function setSyncMeta(showId: string, meta: SyncMeta): Promise<void> {
  await set(showId, meta, metaStore());
}

// ---- User defaults (cross-show preferences) ----

export interface UserDefaults {
  settings: Settings;
  eventTypes: EventType[];
  locationPresets: string[];
  locationPresetsV2?: LocationPreset[];
}

const DEFAULTS_KEY = "user-defaults";

export async function getUserDefaults(): Promise<UserDefaults | null> {
  const defaults = await get<UserDefaults>(DEFAULTS_KEY, defaultsStore());
  return defaults ?? null;
}

export async function saveUserDefaults(defaults: UserDefaults): Promise<void> {
  await set(DEFAULTS_KEY, defaults, defaultsStore());
}

export async function clearUserDefaults(): Promise<void> {
  await del(DEFAULTS_KEY, defaultsStore());
}
