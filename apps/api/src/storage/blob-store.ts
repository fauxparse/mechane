import { createHash } from "node:crypto";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

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

/** Filesystem adapter used for local development; production can provide S3/MinIO behind this API. */
export class LocalBlobStore implements BlobStore {
  readonly root: string;

  constructor(root = process.env.BLOB_STORAGE_PATH ?? ".data/blobs") {
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

export const blobStore = new LocalBlobStore();

export function digestBytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}
