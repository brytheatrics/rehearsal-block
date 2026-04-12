/**
 * Supabase metadata-only storage for shows_index.
 *
 * No document bytes pass through Supabase - only small metadata rows
 * (~500 bytes each). Document blobs live in R2, referenced implicitly
 * by (owner_id, show_id).
 *
 * This module is used client-side for list queries (RLS-enforced) and
 * server-side for metadata updates after R2 writes.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export interface ShowIndexRow {
  id: string;
  owner_id: string;
  owner_email: string | null;
  name: string;
  start_date: string | null;
  end_date: string | null;
  cast_count: number;
  document_hash: string | null;
  document_size_bytes: number | null;
  doc_version: string | null;
  last_saved_at: string | null;
  last_published_at: string | null;
  share_id: string | null;
  conflict_share_token: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * List all shows for the authenticated user. Client-direct via RLS.
 * Returns metadata only - no document bytes.
 */
export async function listShowsMeta(supabase: SupabaseClient): Promise<ShowIndexRow[]> {
  const { data, error } = await supabase
    .from("shows_index")
    .select("*")
    .order("updated_at", { ascending: false });

  if (error) throw new Error(`Failed to list shows: ${error.message}`);
  return data ?? [];
}

/**
 * Get a single show's metadata by ID. Client-direct via RLS.
 */
export async function getShowMeta(supabase: SupabaseClient, showId: string): Promise<ShowIndexRow | null> {
  const { data, error } = await supabase.from("shows_index").select("*").eq("id", showId).maybeSingle();

  if (error) throw new Error(`Failed to load show metadata: ${error.message}`);
  return data;
}

/**
 * Insert a new show metadata row. Used server-side during show creation.
 */
export async function insertShowMeta(
  supabase: SupabaseClient,
  row: {
    id: string;
    owner_id: string;
    owner_email: string | null;
    name: string;
    start_date: string | null;
    end_date: string | null;
    cast_count: number;
    document_hash: string;
    document_size_bytes: number;
    doc_version: string;
  },
): Promise<ShowIndexRow> {
  const { data, error } = await supabase
    .from("shows_index")
    .insert({
      ...row,
      last_saved_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to insert show: ${error.message}`);
  return data;
}

/**
 * Update show metadata after a save. Used server-side after R2 write.
 */
export async function updateShowMeta(
  supabase: SupabaseClient,
  showId: string,
  updates: {
    name?: string;
    start_date?: string | null;
    end_date?: string | null;
    cast_count?: number;
    document_hash?: string;
    document_size_bytes?: number;
    doc_version?: string;
    last_saved_at?: string;
    archived_at?: string | null;
  },
): Promise<void> {
  const { error } = await supabase
    .from("shows_index")
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq("id", showId);

  if (error) throw new Error(`Failed to update show metadata: ${error.message}`);
}

/**
 * Delete a show metadata row. Used server-side during show deletion.
 */
export async function deleteShowMeta(supabase: SupabaseClient, showId: string): Promise<void> {
  const { error } = await supabase.from("shows_index").delete().eq("id", showId);

  if (error) throw new Error(`Failed to delete show: ${error.message}`);
}

/**
 * Record an action in show_activity. Server-side only (service role).
 */
export async function logShowActivity(
  supabase: SupabaseClient,
  entry: {
    show_id: string;
    user_id: string;
    action: string;
  },
): Promise<void> {
  const { error } = await supabase.from("show_activity").insert(entry);

  if (error) throw new Error(`Failed to log show activity: ${error.message}`);
}
