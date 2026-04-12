/**
 * Server-side R2 client singleton. Import this from API routes only.
 *
 * Reads R2 credentials from environment variables. These are set in
 * .env for local dev and Netlify env vars for production.
 */

import {
  R2_ACCOUNT_ID,
  R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY,
  R2_BUCKET_NAME,
} from "$env/static/private";
import { r2ClientFromEnv } from "./r2.js";

export const r2 = r2ClientFromEnv({
  R2_ACCOUNT_ID,
  R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY,
  R2_BUCKET_NAME,
});
