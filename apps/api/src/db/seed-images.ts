import { readFile } from "node:fs/promises";

import { CANDIDATE_IMAGE_REVISION, CANDIDATES } from "./seed-graphs";
import { db } from "./client";
import { imageAssets, blobs } from "./schema";
import { processImage } from "../images";
import { blobStore } from "../storage/blob-store";

const SEED_IMAGES_DIRECTORY = new URL("./seeds/", import.meta.url);

export async function seedVotingImages(showId: string): Promise<void> {
  for (const candidate of CANDIDATES) {
    const bytes = await readFile(new URL(candidate.imageFile, SEED_IMAGES_DIRECTORY));
    const processed = processImage(bytes, "image/png");
    const uploadId = `seed-${candidate.imageAssetId}-${CANDIDATE_IMAGE_REVISION}`;

    await blobStore.putUpload(uploadId, bytes);
    try {
      await blobStore.commitUpload(uploadId, processed);
    } catch (error) {
      await blobStore.deleteUpload(uploadId);
      throw error;
    }

    await db
      .insert(blobs)
      .values({
        digest: processed.digest,
        byteLength: processed.byteLength,
        mimeType: processed.mimeType,
        deliveryPath: `/api/blobs/${processed.digest}`,
      })
      .onConflictDoNothing();
    await db.insert(imageAssets).values({
      id: candidate.imageAssetId,
      showId,
      blobDigest: processed.digest,
      revision: CANDIDATE_IMAGE_REVISION,
      width: processed.width,
      height: processed.height,
      mimeType: processed.mimeType,
      alt: candidate.name,
      blurHash: processed.blurHash,
      state: "active",
      sourceAssetId: null,
    });
  }
}

export type SeedImageSeeder = (showId: string) => Promise<void>;

export const SEED_IMAGE_SEEDERS: Record<string, SeedImageSeeder> = {
  Voting: seedVotingImages,
};
