import { eq, and, desc } from "drizzle-orm";
import type { ImageAsset } from "@mechane/domain";

import { db } from "./client";
import { blobs, imageAssets } from "./schema";

export const imageDeliveryUrl = (assetId: string, revision: string): string =>
  `/api/images/${encodeURIComponent(assetId)}/${encodeURIComponent(revision)}`;

export type ImageAssetRow = typeof imageAssets.$inferSelect;

export function toImageAsset(row: ImageAssetRow): ImageAsset & { url: string } {
  return {
    id: row.id as ImageAsset["id"],
    showId: row.showId as ImageAsset["showId"],
    blobDigest: row.blobDigest,
    revision: row.revision,
    width: row.width,
    height: row.height,
    mimeType: row.mimeType,
    alt: row.alt,
    blurHash: row.blurHash,
    state: row.state as ImageAsset["state"],
    sourceAssetId: row.sourceAssetId as ImageAsset["sourceAssetId"],
    url: imageDeliveryUrl(row.id, row.revision),
  };
}

export async function listImageAssets(showId: string): Promise<(ImageAsset & { url: string })[]> {
  const rows = await db
    .select()
    .from(imageAssets)
    .where(and(eq(imageAssets.showId, showId), eq(imageAssets.state, "active")))
    .orderBy(desc(imageAssets.createdAt));
  return rows.map(toImageAsset);
}

export async function readImageAsset(showId: string, assetId: string, revision?: string) {
  const [row] = await db
    .select()
    .from(imageAssets)
    .where(
      and(
        eq(imageAssets.showId, showId),
        eq(imageAssets.id, assetId),
        eq(imageAssets.state, "active"),
        ...(revision ? [eq(imageAssets.revision, revision)] : []),
      ),
    );
  return row ? toImageAsset(row) : null;
}

export async function commitBlob(input: {
  digest: string;
  byteLength: number;
  mimeType: string;
}): Promise<void> {
  await db.insert(blobs).values({
    digest: input.digest,
    byteLength: input.byteLength,
    mimeType: input.mimeType,
    deliveryPath: `/api/blobs/${input.digest}`,
  }).onConflictDoNothing();
}
