/**
 * Cloudflare R2 blob storage wrapper using the S3-compatible API.
 *
 * Runs ONLY inside Netlify functions (server-side). R2 credentials must
 * never ship to the client. The browser talks to R2 exclusively through
 * the /api/shows endpoints.
 *
 * Bucket / key layout:
 *   show:<userId>:<showId>                          - active show documents
 *   archive:<userId>:<showId>                       - archived shows
 *   snapshots/<userId>/<showId>/<YYYY-MM-DD>.json.gz - daily history
 *   conflict-submissions:<token>                    - private submission inbox
 */

import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  CopyObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";

export interface R2Client {
  /** Fetch an object by key. Returns null if not found. Returns raw bytes. */
  get(key: string): Promise<Uint8Array | null>;

  /** Upload bytes to a key. Overwrites if exists. */
  put(key: string, body: Uint8Array, contentType?: string): Promise<void>;

  /** Delete an object by key. Idempotent. */
  delete(key: string): Promise<void>;

  /** Copy an object from one key to another. Used by the daily snapshot flow. */
  copy(sourceKey: string, destKey: string): Promise<void>;

  /** Check if an object exists. Used by healthcheck. */
  head(key: string): Promise<boolean>;

  /** List object keys with a prefix. */
  list(prefix: string): Promise<string[]>;
}

export interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
}

export function createR2Client(config: R2Config): R2Client {
  const s3 = new S3Client({
    region: "auto",
    endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });

  const Bucket = config.bucketName;

  return {
    async get(key: string): Promise<Uint8Array | null> {
      try {
        const res = await s3.send(new GetObjectCommand({ Bucket, Key: key }));
        if (!res.Body) return null;
        return new Uint8Array(await res.Body.transformToByteArray());
      } catch (e: any) {
        if (e.name === "NoSuchKey" || e.$metadata?.httpStatusCode === 404) {
          return null;
        }
        throw e;
      }
    },

    async put(key: string, body: Uint8Array, contentType?: string): Promise<void> {
      await s3.send(
        new PutObjectCommand({
          Bucket,
          Key: key,
          Body: body,
          ContentType: contentType ?? "application/gzip",
        }),
      );
    },

    async delete(key: string): Promise<void> {
      try {
        await s3.send(new DeleteObjectCommand({ Bucket, Key: key }));
      } catch (e: any) {
        // DeleteObject is idempotent on S3/R2 - 404 is fine
        if (e.name !== "NoSuchKey" && e.$metadata?.httpStatusCode !== 404) {
          throw e;
        }
      }
    },

    async copy(sourceKey: string, destKey: string): Promise<void> {
      await s3.send(
        new CopyObjectCommand({
          Bucket,
          CopySource: `${Bucket}/${sourceKey}`,
          Key: destKey,
        }),
      );
    },

    async head(key: string): Promise<boolean> {
      try {
        await s3.send(new HeadObjectCommand({ Bucket, Key: key }));
        return true;
      } catch {
        return false;
      }
    },

    async list(prefix: string): Promise<string[]> {
      const keys: string[] = [];
      let continuationToken: string | undefined;
      do {
        const res: any = await s3.send(
          new ListObjectsV2Command({
            Bucket,
            Prefix: prefix,
            ContinuationToken: continuationToken,
          }),
        );
        for (const obj of res.Contents ?? []) {
          if (obj.Key) keys.push(obj.Key);
        }
        continuationToken = res.IsTruncated ? res.NextContinuationToken : undefined;
      } while (continuationToken);
      return keys;
    },
  };
}

/**
 * Build an R2Client from environment variables. Call from server-side only.
 */
export function r2ClientFromEnv(env: {
  R2_ACCOUNT_ID: string;
  R2_ACCESS_KEY_ID: string;
  R2_SECRET_ACCESS_KEY: string;
  R2_BUCKET_NAME: string;
}): R2Client {
  return createR2Client({
    accountId: env.R2_ACCOUNT_ID,
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    bucketName: env.R2_BUCKET_NAME,
  });
}
