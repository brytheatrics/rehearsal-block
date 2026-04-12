/**
 * Cloudflare R2 blob storage wrapper.
 *
 * STUB: to be implemented in Phase 1 of the paid version plan. See
 * `C:\Users\blake\.claude\plans\curious-cuddling-moth.md` "Phase 1 - Storage
 * foundation" for the full design.
 *
 * R2 holds the fat bytes of every rehearsal block show document (gzipped
 * JSON), plus daily version snapshots, archived shows, published share
 * snapshots, conflict collection snapshots, and backups. Supabase holds only
 * the small metadata index row. This split is the core reason the paid
 * version can run on free tiers - Supabase bandwidth budget stays tiny
 * because it's not in the hot path for document data.
 *
 * When implementing:
 * - Runs only inside Netlify functions (server-side). Never called from the
 *   browser. R2 credentials must never ship to the client.
 * - Uses @aws-sdk/client-s3 pointed at the R2 S3-compatible endpoint.
 *   Consider aws4fetch as a lighter alternative (~20KB vs ~500KB) if
 *   function cold starts become an issue.
 * - Three operations only: getObject, putObject, deleteObject. Plus
 *   copyObject for the daily snapshot flow (first-save-of-day copies the
 *   existing blob to a snapshots/ key before overwriting).
 * - Env vars: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY,
 *   R2_BUCKET_NAME. Dev points to `rehearsal-block-shows-dev`, prod points
 *   to `rehearsal-block-shows`. No code branching - just config.
 *
 * Bucket / key layout (see plan Phase 1 for full reference):
 *   show:<userId>:<showId>                 - active show documents
 *   archive:<userId>:<showId>              - archived shows
 *   snapshots/<userId>/<showId>/<YYYY-MM-DD>.json.gz - daily history
 *   conflict-submissions:<token>           - private submission inbox
 *   backups/pg/<YYYY-MM-DD>.sql.gz         - nightly pg_dump backups
 *
 * Public read-only bucket (rehearsal-block-public, Phase 5 not this one):
 *   share/<token>.json.gz                  - published share snapshot
 *   conflict-show/<token>.json.gz          - actor-facing conflict snapshot
 */

export interface R2Client {
  /** Fetch an object by key. Returns null if not found. Returns gzipped bytes. */
  get(key: string): Promise<Uint8Array | null>;

  /** Upload gzipped bytes to a key. Overwrites if exists. */
  put(key: string, gzippedBytes: Uint8Array): Promise<void>;

  /** Delete an object by key. Idempotent. */
  delete(key: string): Promise<void>;

  /** Copy an object from one key to another. Used by the daily snapshot flow. */
  copy(sourceKey: string, destKey: string): Promise<void>;
}

/**
 * Create an R2 client. Stub - real implementation pending Phase 1.
 */
export function createR2Client(_config: {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
}): R2Client {
  return {
    async get(_key: string): Promise<Uint8Array | null> {
      throw new Error("R2 client not yet implemented - see plans/curious-cuddling-moth.md Phase 1");
    },
    async put(_key: string, _gzippedBytes: Uint8Array): Promise<void> {
      throw new Error("R2 client not yet implemented - see plans/curious-cuddling-moth.md Phase 1");
    },
    async delete(_key: string): Promise<void> {
      throw new Error("R2 client not yet implemented - see plans/curious-cuddling-moth.md Phase 1");
    },
    async copy(_sourceKey: string, _destKey: string): Promise<void> {
      throw new Error("R2 client not yet implemented - see plans/curious-cuddling-moth.md Phase 1");
    },
  };
}
