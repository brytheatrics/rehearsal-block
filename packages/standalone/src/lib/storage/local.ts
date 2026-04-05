/**
 * localStorage-backed storage for anonymous or offline users.
 *
 * STUB: this will be fully implemented in the next session when the
 * calendar grid and day editor are built. Keeping it as a throwing stub
 * ensures the storage interface is wired up correctly from day one.
 */

import type { ShowStorage, StoredShow } from "./types.js";

export const localStorage_: ShowStorage = {
  canWrite: true,

  async listShows(): Promise<StoredShow[]> {
    throw new Error("localStorage storage not yet implemented — fill in next session");
  },

  async loadShow(_id: string): Promise<StoredShow | null> {
    throw new Error("localStorage storage not yet implemented — fill in next session");
  },

  async saveShow(_show: StoredShow): Promise<StoredShow> {
    throw new Error("localStorage storage not yet implemented — fill in next session");
  },

  async deleteShow(_id: string): Promise<void> {
    throw new Error("localStorage storage not yet implemented — fill in next session");
  },
};
