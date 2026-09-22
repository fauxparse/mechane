import type { ShowGraph } from "@mechane/domain";
import { and, eq } from "drizzle-orm";

import { db } from "./client";
import { runDeviceTransformerSeeds, runTransformerSeeds } from "./schema";

function shuffleTransformerIds(graph: ShowGraph, parent: "show" | "instance"): string[] {
  return graph.nodes.flatMap((node) =>
    node.kind === "transformer" &&
    node.transform.kind === "shuffle" &&
    (parent === "show" ? node.parentId === null : node.parentId !== null)
      ? [node.id]
      : [],
  );
}

async function showSeeds(runId: string, transformerIds: readonly string[]) {
  await db
    .insert(runTransformerSeeds)
    .values(
      transformerIds.map((transformerId) => ({ runId, transformerId, seed: crypto.randomUUID() })),
    )
    .onConflictDoNothing();
  return db.select().from(runTransformerSeeds).where(eq(runTransformerSeeds.runId, runId));
}

async function deviceSeeds(runId: string, deviceId: string, transformerIds: readonly string[]) {
  await db
    .insert(runDeviceTransformerSeeds)
    .values(
      transformerIds.map((transformerId) => ({
        runId,
        deviceId,
        transformerId,
        seed: crypto.randomUUID(),
      })),
    )
    .onConflictDoNothing();
  return db
    .select()
    .from(runDeviceTransformerSeeds)
    .where(
      and(
        eq(runDeviceTransformerSeeds.runId, runId),
        eq(runDeviceTransformerSeeds.deviceId, deviceId),
      ),
    );
}

/** Reuses scope-owned seeds across snapshots and compatible publications. */
export async function readOrCreateTransformerSeeds(
  runId: string,
  deviceId: string,
  graph: ShowGraph,
  includeSharedInstance: boolean,
): Promise<Readonly<Record<string, string>>> {
  const showIds = shuffleTransformerIds(graph, "show");
  const instanceIds = includeSharedInstance ? shuffleTransformerIds(graph, "instance") : [];
  const [showRows, deviceRows] = await Promise.all([
    showIds.length > 0 ? showSeeds(runId, showIds) : [],
    instanceIds.length > 0 ? deviceSeeds(runId, deviceId, instanceIds) : [],
  ]);
  const activeIds = new Set([...showIds, ...instanceIds]);
  return Object.fromEntries(
    [...showRows, ...deviceRows]
      .filter((row) => activeIds.has(row.transformerId))
      .map((row) => [row.transformerId, row.seed]),
  );
}

/** Changes one Shuffle root without touching unrelated Transformer seeds. */
export async function reshuffleTransformer(
  runId: string,
  transformerId: string,
  deviceId?: string,
): Promise<void> {
  const seed = crypto.randomUUID();
  if (deviceId === undefined) {
    await db
      .insert(runTransformerSeeds)
      .values({ runId, transformerId, seed })
      .onConflictDoUpdate({
        target: [runTransformerSeeds.runId, runTransformerSeeds.transformerId],
        set: { seed },
      });
    return;
  }
  await db
    .insert(runDeviceTransformerSeeds)
    .values({ runId, deviceId, transformerId, seed })
    .onConflictDoUpdate({
      target: [
        runDeviceTransformerSeeds.runId,
        runDeviceTransformerSeeds.deviceId,
        runDeviceTransformerSeeds.transformerId,
      ],
      set: { seed },
    });
}
