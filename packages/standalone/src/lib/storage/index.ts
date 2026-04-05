/**
 * Storage factory: picks the right implementation based on context.
 */

export { demoStorage, DEMO_SHOW_ID } from "./demo.js";
export { localStorage_ } from "./local.js";
export { createSupabaseStorage } from "./supabase.js";
export type { ShowStorage, StoredShow } from "./types.js";
export { PaywallError } from "./types.js";
