import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  HeadBucketCommand,
  CreateBucketCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Errors } from '../common/errors';

/**
 * Thin wrapper around the AWS SDK v3 S3 client. Works against MinIO locally
 * (path-style addressing, custom endpoint) and real S3 in production (default
 * DNS-bucket-style addressing).
 *
 * All methods translate transport-level failures into `STORAGE_UNAVAILABLE`.
 * 404/NotFound on HEAD is surfaced as `null` so callers can distinguish
 * "object missing" from "storage unreachable".
 */
@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor() {
    const region = process.env.S3_REGION ?? 'us-east-1';
    const endpoint = process.env.S3_ENDPOINT?.trim();
    const accessKeyId = process.env.S3_ACCESS_KEY ?? '';
    const secretAccessKey = process.env.S3_SECRET_KEY ?? '';
    const forcePathStyleEnv = (process.env.S3_FORCE_PATH_STYLE ?? 'true').toLowerCase();
    const forcePathStyle = forcePathStyleEnv === 'true' || forcePathStyleEnv === '1';

    this.bucket = process.env.S3_BUCKET ?? 'nayanam-attachments';
    this.client = new S3Client({
      region,
      credentials: accessKeyId && secretAccessKey ? { accessKeyId, secretAccessKey } : undefined,
      ...(endpoint ? { endpoint, forcePathStyle } : {}),
    });
  }

  async onModuleInit() {
    if (process.env.NODE_ENV === 'production') return;
    await this.ensureBucket();
  }

  getBucketName(): string {
    return this.bucket;
  }

  async ensureBucket(): Promise<void> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
      return;
    } catch (err) {
      // Not found — try to create in dev. In prod we skip onModuleInit entirely.
      if (!isNotFoundError(err)) {
        this.logger.warn(
          `HeadBucket failed for "${this.bucket}" — continuing without bootstrap: ${String(err)}`,
        );
        return;
      }
    }
    try {
      await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
      this.logger.log(`Created bucket "${this.bucket}" (dev bootstrap).`);
    } catch (err) {
      if (isBucketAlreadyOwnedError(err)) return;
      this.logger.warn(`CreateBucket failed for "${this.bucket}": ${String(err)}`);
    }
  }

  async presignPut(
    key: string,
    mime: string,
    expiresInSec = 300,
  ): Promise<{ url: string; requiredHeaders: Record<string, string>; expiresAt: Date }> {
    try {
      const url = await getSignedUrl(
        this.client,
        new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: mime }),
        { expiresIn: expiresInSec },
      );
      return {
        url,
        requiredHeaders: { 'Content-Type': mime },
        expiresAt: new Date(Date.now() + expiresInSec * 1000),
      };
    } catch (err) {
      throw Errors.storageUnavailable({ op: 'presignPut', cause: String(err) });
    }
  }

  async presignGet(key: string, expiresInSec = 300): Promise<string> {
    try {
      return await getSignedUrl(
        this.client,
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
        { expiresIn: expiresInSec },
      );
    } catch (err) {
      throw Errors.storageUnavailable({ op: 'presignGet', cause: String(err) });
    }
  }

  /**
   * Returns object metadata, or `null` when the object does not exist.
   * Throws `STORAGE_UNAVAILABLE` on transport errors.
   */
  async headObject(
    key: string,
  ): Promise<{ size: number; mime: string | null; etag: string | null; lastModified: Date | null } | null> {
    try {
      const res = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return {
        size: Number(res.ContentLength ?? 0),
        mime: res.ContentType ?? null,
        etag: res.ETag ?? null,
        lastModified: res.LastModified ?? null,
      };
    } catch (err) {
      if (isNotFoundError(err)) return null;
      throw Errors.storageUnavailable({ op: 'headObject', cause: String(err) });
    }
  }

  async deleteObject(key: string): Promise<void> {
    try {
      await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
    } catch (err) {
      if (isNotFoundError(err)) return;
      // Log and swallow — delete is best-effort to avoid zombie rows blocking
      // the caller.
      this.logger.warn(`deleteObject("${key}") failed: ${String(err)}`);
    }
  }

  async uploadBuffer(key: string, buf: Buffer, mime: string): Promise<void> {
    try {
      await this.client.send(
        new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: buf, ContentType: mime }),
      );
    } catch (err) {
      throw Errors.storageUnavailable({ op: 'uploadBuffer', cause: String(err) });
    }
  }

  async getObjectBytes(key: string): Promise<Buffer> {
    try {
      const res = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      const body = res.Body;
      if (!body) throw new Error('Empty response body.');
      const chunks: Buffer[] = [];
      // Node.js stream (SDK v3 returns a readable stream on Node).
      const stream = body as unknown as AsyncIterable<Uint8Array>;
      for await (const chunk of stream) {
        chunks.push(Buffer.from(chunk));
      }
      return Buffer.concat(chunks);
    } catch (err) {
      throw Errors.storageUnavailable({ op: 'getObjectBytes', cause: String(err) });
    }
  }
}

function isNotFoundError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { name?: string; $metadata?: { httpStatusCode?: number }; Code?: string };
  if (e.name === 'NotFound' || e.name === 'NoSuchKey' || e.name === 'NoSuchBucket') return true;
  if (e.Code === 'NotFound' || e.Code === 'NoSuchKey' || e.Code === 'NoSuchBucket') return true;
  return e.$metadata?.httpStatusCode === 404;
}

function isBucketAlreadyOwnedError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { name?: string; Code?: string };
  return (
    e.name === 'BucketAlreadyOwnedByYou' ||
    e.name === 'BucketAlreadyExists' ||
    e.Code === 'BucketAlreadyOwnedByYou' ||
    e.Code === 'BucketAlreadyExists'
  );
}
