import type { GraphEdit } from "@mechane/commands";
import type { ShowGraph } from "@mechane/domain/graph";
import type { ImageAssetReference } from "@mechane/domain/shapes";
import {
  assertTemplateConforms,
  canonicalValue,
  selectedValueContract,
  ValueTransferError,
} from "@mechane/domain/value-transfer";
import { and, eq } from "drizzle-orm";

import { db } from "./client";
import { imageAssets } from "./schema";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function assertActiveValueImages(
  tx: Tx,
  showId: string,
  images: readonly ImageAssetReference[],
): Promise<void> {
  const seen = new Set<string>();
  for (const image of images) {
    const key = canonicalValue(image);
    if (seen.has(key)) continue;
    seen.add(key);
    const [row] = await tx
      .select({ id: imageAssets.id })
      .from(imageAssets)
      .where(
        and(
          eq(imageAssets.showId, showId),
          eq(imageAssets.id, image.assetId),
          eq(imageAssets.revision, image.revision),
          eq(imageAssets.state, "active"),
        ),
      )
      .for("share");
    if (!row)
      throw new ValueTransferError({
        category: "rejected-input",
        stage: "asset-staging",
        code: "unavailable-or-not-authorized",
        message:
          "The replacement uses an image this Show does not own at that exact active revision.",
        path: [],
        nextAction: "Choose an active image owned by this Show, then paste again.",
      });
  }
}

/** Undo and Redo recheck the resources they reintroduce, not unchanged historical entries. */
export async function assertSourceReplacementResources(
  tx: Tx,
  showId: string,
  graph: ShowGraph,
  edits: readonly GraphEdit[],
): Promise<void> {
  const images: ImageAssetReference[] = [];
  for (const edit of edits) {
    if (edit.type !== "graph.replaceSourceDefaults") continue;
    const previous = new Map(
      edit.before.map((entry) => [
        canonicalValue([entry.nodeId, entry.fieldPath]),
        canonicalValue(entry.value),
      ]),
    );
    for (const entry of edit.after) {
      if (
        previous.get(canonicalValue([entry.nodeId, entry.fieldPath])) ===
        canonicalValue(entry.value)
      )
        continue;
      const contract = selectedValueContract(graph, entry.nodeId, entry.fieldPath);
      assertTemplateConforms(
        entry.value,
        contract.type,
        graph.shapes ?? [],
        contract.allowsAbsence,
        [entry.nodeId, ...entry.fieldPath],
      );
      const pending: unknown[] = [entry.value];
      while (pending.length > 0) {
        const value = pending.pop();
        if (!value || typeof value !== "object") continue;
        if (
          !Array.isArray(value) &&
          "assetId" in value &&
          "revision" in value &&
          typeof value.assetId === "string" &&
          typeof value.revision === "string"
        ) {
          images.push({ assetId: value.assetId, revision: value.revision });
        } else {
          for (const child of Object.values(value)) pending.push(child);
        }
      }
    }
  }
  await assertActiveValueImages(tx, showId, images);
}
