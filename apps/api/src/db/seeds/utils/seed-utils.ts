import { and, eq } from "drizzle-orm";

import { readCanvasWorkspace, writeCanvasRows } from "../../canvas";
import { db } from "../../client";
import { showGraphs } from "../../schema";
import { publishShowGraph, writeShowGraph } from "../../show-graph";
import type { Canvas, Position, ShowGraph } from "@mechane/domain";

export type SeedCanvas = Canvas & { id: string };
export type SeedCanvases = Record<string, SeedCanvas>;

export type SeedShow = {
  readonly name: string;
  readonly seed: (showId: string) => Promise<void>;
};

const SEEDED_CANVAS_WIDTH = 720;
const SEEDED_CANVAS_HEIGHT = 420;
const SEEDED_CANVAS_GAP = 80;
const SEEDED_BLOCK_START_Y = 900;

/** Places seeded Scene Canvases in a row, matching new Scene placement. */
export function seedCanvasPosition(index: number): Position {
  return { x: index * (SEEDED_CANVAS_WIDTH + SEEDED_CANVAS_GAP), y: 0 };
}

/** Places seeded Block Canvases in a column below the Scene row. */
export function seedBlockCanvasPosition(index: number): Position {
  return {
    x: 0,
    y: SEEDED_BLOCK_START_Y + index * (SEEDED_CANVAS_HEIGHT + SEEDED_CANVAS_GAP),
  };
}

export async function assertSeedCanvases(
  showId: string,
  state: "draft" | "published",
  graph: ShowGraph,
): Promise<void> {
  const expectedSceneIds = new Set(
    graph.nodes.filter((node) => node.kind === "scene").map((node) => node.id),
  );
  const workspace = await readCanvasWorkspace(showId, state);
  const actualSceneIds = new Set(
    workspace.canvases.filter((canvas) => canvas.kind === "scene").map((canvas) => canvas.ownerId),
  );
  const missingScenes = [...expectedSceneIds].filter((sceneId) => !actualSceneIds.has(sceneId));
  if (missingScenes.length > 0) {
    throw new Error(
      `Seeded ${state} graph is missing Canvases for Scenes: ${missingScenes.join(", ")}`,
    );
  }
  const expectedBlockIds = new Set((graph.blocks ?? []).map((block) => block.id));
  const actualBlockIds = new Set(
    workspace.canvases.filter((canvas) => canvas.kind === "block").map((canvas) => canvas.ownerId),
  );
  const missingBlocks = [...expectedBlockIds].filter((blockId) => !actualBlockIds.has(blockId));
  if (missingBlocks.length > 0) {
    throw new Error(
      `Seeded ${state} graph is missing Canvases for Blocks: ${missingBlocks.join(", ")}`,
    );
  }
}

async function seedCanvases(
  showId: string,
  state: "draft" | "published",
  graph: ShowGraph,
  canvases: SeedCanvases,
): Promise<Map<string, string>> {
  const [graphRow] = await db
    .select({ id: showGraphs.id })
    .from(showGraphs)
    .where(and(eq(showGraphs.showId, showId), eq(showGraphs.state, state)));
  if (!graphRow) throw new Error(`Seeded ${state} graph for Show "${showId}" was not found.`);
  return db.transaction(async (tx) => {
    const now = new Date();
    const canvasIds = new Map<string, string>();
    for (const [index, [sceneId, canvas]] of Object.entries(canvases).entries()) {
      const scene = graph.nodes.find((node) => node.id === sceneId && node.kind === "scene");
      if (!scene || scene.kind !== "scene")
        throw new Error(`Seed canvas "${sceneId}" has no Scene node.`);
      const canvasId = await writeCanvasRows(
        tx,
        showId,
        graphRow.id,
        { sceneNodeId: sceneId },
        canvas,
        now,
        seedCanvasPosition(index),
      );
      canvasIds.set(sceneId, canvasId);
      if (typeof canvas.id === "string") canvasIds.set(canvas.id, canvasId);
    }
    return canvasIds;
  });
}

async function seedBlockCanvases(
  showId: string,
  state: "draft" | "published",
  graph: ShowGraph,
): Promise<void> {
  const blocks = graph.blocks ?? [];
  if (blocks.length === 0) return;
  const [graphRow] = await db
    .select({ id: showGraphs.id })
    .from(showGraphs)
    .where(and(eq(showGraphs.showId, showId), eq(showGraphs.state, state)));
  if (!graphRow) throw new Error(`Seeded ${state} graph for Show "${showId}" was not found.`);
  await db.transaction(async (tx) => {
    const now = new Date();
    for (const [index, block] of blocks.entries()) {
      await writeCanvasRows(
        tx,
        showId,
        graphRow.id,
        { blockId: block.id },
        block.canvas,
        now,
        seedBlockCanvasPosition(index),
      );
    }
  });
}

export async function seedShowData(
  showId: string,
  buildGraph: () => ShowGraph,
  buildCanvases: () => SeedCanvases,
  seedAssets?: (showId: string) => Promise<void>,
): Promise<void> {
  const graph = buildGraph();
  const canvases = buildCanvases();
  await seedAssets?.(showId);
  const initialGraph =
    (graph.eventBindings?.length ?? 0) > 0 ? { ...graph, eventBindings: [] } : graph;
  await writeShowGraph(showId, "draft", initialGraph);
  const draftCanvasIds = await seedCanvases(showId, "draft", initialGraph, canvases);
  const graphWithBindings =
    (graph.eventBindings?.length ?? 0) > 0
      ? {
          ...graph,
          eventBindings: (graph.eventBindings ?? []).map((binding) => ({
            ...binding,
            canvasId: draftCanvasIds.get(binding.canvasId) ?? binding.canvasId,
          })),
        }
      : graph;
  if (graphWithBindings.eventBindings?.length) {
    await writeShowGraph(showId, "draft", graphWithBindings);
  }
  await seedBlockCanvases(showId, "draft", graphWithBindings);
  await assertSeedCanvases(showId, "draft", graphWithBindings);
  if (graphWithBindings.eventBindings?.length) {
    await writeShowGraph(showId, "published", initialGraph);
    await seedCanvases(showId, "published", initialGraph, canvases);
  }
  await publishShowGraph(showId);
  if (!graphWithBindings.eventBindings?.length) {
    await seedCanvases(showId, "published", graphWithBindings, canvases);
  }
  await seedBlockCanvases(showId, "published", graphWithBindings);
  await assertSeedCanvases(showId, "published", graphWithBindings);
}
