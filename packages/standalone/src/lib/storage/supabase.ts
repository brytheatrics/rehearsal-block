/**
 * Supabase-backed storage for signed-in paid users.
 *
 * STUB: this will be fully implemented in the next session. The interface
 * is in place so route code can import from this file and the real
 * implementation can drop in without changing callers.
 */

import type { ShowStorage, StoredShow } from "./types.js";

export function createSupabaseStorage(_supabase: unknown, _userId: string): ShowStorage {
  return {
    canWrite: true,

    async listShows(): Promise<StoredShow[]> {
      throw new Error("Supabase storage not yet implemented — fill in next session");
    },

    async loadShow(_id: string): Promise<StoredShow | null> {
      throw new Error("Supabase storage not yet implemented — fill in next session");
    },

    async saveShow(_show: StoredShow): Promise<StoredShow> {
      throw new Error("Supabase storage not yet implemented — fill in next session");
    },

    async deleteShow(_id: string): Promise<void> {
      throw new Error("Supabase storage not yet implemented — fill in next session");
    },
  };
}
