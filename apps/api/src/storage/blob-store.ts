import { createHash } from "node:crypto";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  CopyObjectCommand,
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from "@aws-sdk/client-s3";

const DEFAULT_BLOB_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../.data/blobs");

export interface BlobCandidate {
  digest: string;
  byteLength: number;
  mimeType: string;
}

export interface BlobStore {
  putUpload(sessionId: string, bytes: Uint8Array): Promise<void>;
  readUpload(sessionId: string): Promise<Buffer>;
  commitUpload(sessionId: string, candidate: BlobCandidate): Promise<void>;
  readBlob(digest: string): Promise<Buffer | null>;
  deleteUpload(sessionId: string): Promise<void>;
}

export class LocalBlobStore implements BlobStore {
  readonly root: string;

  constructor(root = process.env.BLOB_STORAGE_PATH ?? DEFAULT_BLOB_ROOT) {
    this.root = root;
  }

  private uploadPath(sessionId: string): string {
    return join(this.root, "uploads", sessionId);
  }

  private blobPath(digest: string): string {
    return join(this.root, "committed", digest);
  }

  async putUpload(sessionId: string, bytes: Uint8Array): Promise<void> {
    const path = this.uploadPath(sessionId);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, bytes);
  }

  async readUpload(sessionId: string): Promise<Buffer> {
    return readFile(this.uploadPath(sessionId));
  }

  async commitUpload(sessionId: string, candidate: BlobCandidate): Promise<void> {
    const source = this.uploadPath(sessionId);
    const destination = this.blobPath(candidate.digest);
    await mkdir(dirname(destination), { recursive: true });
    try {
      await stat(destination);
    } catch {
      await rename(source, destination);
      return;
    }
    await rm(source, { force: true });
  }

  async readBlob(digest: string): Promise<Buffer | null> {
    try {
      return await readFile(this.blobPath(digest));
    } catch {
      return null;
    }
  }

  async deleteUpload(sessionId: string): Promise<void> {
    await rm(this.uploadPath(sessionId), { force: true });
  }
}

function isMissingObject(error: unknown): boolean {
  return (
    error instanceof S3ServiceException &&
    ["NoSuchKey", "NotFound", "NoSuchBucket"].includes(error.name)
  );
}

export class MinioBlobStore implements BlobStore {
  private readonly client: S3Client;
  private readonly bucket: string;
  private bucketReady: Promise<void> | undefined;

  constructor(
    endpoint = process.env.BLOB_STORAGE_ENDPOINT ?? "http://localhost:9000",
    bucket = process.env.BLOB_STORAGE_BUCKET ?? "mechane",
    accessKeyId = process.env.BLOB_STORAGE_ACCESS_KEY ?? "minioadmin",
    secretAccessKey = process.env.BLOB_STORAGE_SECRET_KEY ?? "minioadmin",
    region = process.env.BLOB_STORAGE_REGION ?? "us-east-1",
  ) {
    this.bucket = bucket;
    this.client = new S3Client({
      endpoint,
      region,
      forcePathStyle: true,
      credentials: { accessKeyId, secretAccessKey },
    });
  }

  private async ensureBucket(): Promise<void> {
    this.bucketReady ??= (async () => {
      try {
        await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
      } catch (error: unknown) {
        if (
          !(error instanceof S3ServiceException) ||
          !["NotFound", "NoSuchBucket"].includes(error.name)
        )
          throw error;
        await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
      }
    })();
    try {
      await this.bucketReady;
    } catch (error) {
      this.bucketReady = undefined;
      throw error;
    }
  }

  private uploadKey(sessionId: string): string {
    return `uploads/${sessionId}`;
  }

  private blobKey(digest: string): string {
    return `blobs/${digest}`;
  }

  async putUpload(sessionId: string, bytes: Uint8Array): Promise<void> {
    await this.ensureBucket();
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: this.uploadKey(sessionId),
        Body: bytes,
        ContentLength: bytes.byteLength,
      }),
    );
  }

  async readUpload(sessionId: string): Promise<Buffer> {
    await this.ensureBucket();
    const response = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: this.uploadKey(sessionId) }),
    );
    if (!response.Body) throw new Error(`Upload ${sessionId} has no stored body.`);
    return Buffer.from(await response.Body.transformToByteArray());
  }

  async commitUpload(sessionId: string, candidate: BlobCandidate): Promise<void> {
    await this.ensureBucket();
    const key = this.blobKey(candidate.digest);
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
    } catch (error) {
      if (!isMissingObject(error)) throw error;
      await this.client.send(
        new CopyObjectCommand({
          Bucket: this.bucket,
          Key: key,
          CopySource: encodeURIComponent(`${this.bucket}/${this.uploadKey(sessionId)}`),
          ContentType: candidate.mimeType,
          MetadataDirective: "REPLACE",
        }),
      );
    }
    await this.deleteUpload(sessionId);
  }

  async readBlob(digest: string): Promise<Buffer | null> {
    await this.ensureBucket();
    try {
      const response = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: this.blobKey(digest) }),
      );
      if (!response.Body) return null;
      return Buffer.from(await response.Body.transformToByteArray());
    } catch (error) {
      if (isMissingObject(error)) return null;
      throw error;
    }
  }

  async deleteUpload(sessionId: string): Promise<void> {
    await this.ensureBucket();
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: this.uploadKey(sessionId) }),
    );
  }
}

export const blobStore: BlobStore =
  process.env.BLOB_STORAGE_DRIVER === "local" ? new LocalBlobStore() : new MinioBlobStore();

export function digestBytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}
