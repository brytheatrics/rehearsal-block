/**
 * Demo-mode storage: serves the prefilled Romeo & Juliet sample show
 * from @rehearsal-block/core. All writes throw PaywallError.
 *
 * Used on the /demo route so prospective customers can explore the app
 * without signing up. Any attempt to save, delete, or export triggers
 * the paywall modal.
 */

import { sampleShow } from "@rehearsal-block/core";
import { PaywallError, type ShowStorage, type StoredShow } from "./types.js";

const DEMO_SHOW_ID = "demo-romeo-and-juliet";

const demoRecord: StoredShow = {
  id: DEMO_SHOW_ID,
  name: sampleShow.show.name,
  updatedAt: new Date().toISOString(),
  document: sampleShow,
};

export const demoStorage: ShowStorage = {
  canWrite: false,

  async listShows() {
    return [demoRecord];
  },

  async loadShow(id: string) {
    if (id === DEMO_SHOW_ID) return demoRecord;
    return null;
  },

  async saveShow() {
    throw new PaywallError();
  },

  async deleteShow() {
    throw new PaywallError();
  },
};

export { DEMO_SHOW_ID };
