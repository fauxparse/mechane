import type { Position } from "@mechane/domain";
import { generateId } from "@mechane/domain";
import { and, eq, inArray } from "drizzle-orm";

import { DEFAULT_CANVAS_FILL, newCanvasRootProperties } from "./canvas-defaults";
import { placeCanvasPosition } from "./canvas-placement";
import { db } from "./client";
import { blocks, canvasElements, canvases, graphNodes } from "./schema";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export interface CanvasFillSnapshot {
  id: string;
  sceneNodeId: string | null;
  createdAt: Date;
}

export interface CanvasRootSnapshot {
  canvasId: string;
  parentId: string | null;
  properties: unknown;
}

export interface CanvasFills {
  scene: string | undefined;
  block: string | undefined;
}

/** Finds the most recently authored root fill for each Canvas owner kind. */
export function latestCanvasFills(
  canvasRows: readonly CanvasFillSnapshot[],
  rootRows: readonly CanvasRootSnapshot[],
): CanvasFills {
  const rootsByCanvas = new Map(rootRows.map((root) => [root.canvasId, root]));
  const fills: CanvasFills = { scene: undefined, block: undefined };

  for (const canvas of [...canvasRows].sort(
    (left, right) => left.createdAt.getTime() - right.createdAt.getTime(),
  )) {
    const root = rootsByCanvas.get(canvas.id);
    if (!root || root.parentId !== null) continue;
    if (root.properties === null || typeof root.properties !== "object") continue;
    if (Array.isArray(root.properties) || !("fill" in root.properties)) continue;
    const fill = root.properties.fill;
    if (typeof fill === "string" && fill.length > 0) {
      fills[canvas.sceneNodeId === null ? "block" : "scene"] = fill;
    }
  }

  return fills;
}

interface ExistingCanvas extends CanvasFillSnapshot {
  blockId: string | null;
  positionX: number;
  positionY: number;
}

/**
 * Ensures every current Scene and Block has a Canvas without rewriting an
 * existing Canvas or its Element tree.
 */
export async function reconcileSceneCanvases(
  tx: Tx,
  graphId: string,
  sceneIds: readonly string[],
): Promise<void> {
  const existingCanvases: ExistingCanvas[] = await tx
    .select({
      id: canvases.id,
      sceneNodeId: canvases.sceneNodeId,
      blockId: canvases.blockId,
      positionX: canvases.positionX,
      positionY: canvases.positionY,
      createdAt: canvases.createdAt,
    })
    .from(canvases)
    .where(eq(canvases.graphId, graphId));
  const existingSceneIds = new Set(
    existingCanvases.flatMap((canvas) => (canvas.sceneNodeId ? [canvas.sceneNodeId] : [])),
  );
  const existingBlockIds = new Set(
    existingCanvases.flatMap((canvas) => (canvas.blockId ? [canvas.blockId] : [])),
  );

  const sceneRows =
    sceneIds.length === 0
      ? []
      : await tx
          .select({
            id: graphNodes.id,
            positionX: graphNodes.positionX,
            positionY: graphNodes.positionY,
          })
          .from(graphNodes)
          .where(
            and(
              eq(graphNodes.graphId, graphId),
              eq(graphNodes.kind, "scene"),
              inArray(graphNodes.id, [...sceneIds]),
            ),
          );
  const graphBlocks = await tx
    .select({ id: blocks.id })
    .from(blocks)
    .where(eq(blocks.graphId, graphId));
  const missingScenes = sceneRows.filter((scene) => !existingSceneIds.has(scene.id));
  const missingBlocks = graphBlocks.filter((block) => !existingBlockIds.has(block.id));
  if (missingScenes.length === 0 && missingBlocks.length === 0) return;

  const existingCanvasIds = existingCanvases.map((canvas) => canvas.id);
  const rootRows: CanvasRootSnapshot[] =
    existingCanvasIds.length === 0
      ? []
      : await tx
          .select({
            canvasId: canvasElements.canvasId,
            parentId: canvasElements.parentId,
            properties: canvasElements.properties,
          })
          .from(canvasElements)
          .where(inArray(canvasElements.canvasId, existingCanvasIds));
  const fills = latestCanvasFills(existingCanvases, rootRows);
  const occupied = existingCanvases.map((canvas) => ({ x: canvas.positionX, y: canvas.positionY }));

  for (const scene of sceneRows) {
    if (existingSceneIds.has(scene.id)) continue;
    const position = placeCanvasPosition({ x: scene.positionX, y: scene.positionY }, occupied);
    await insertCanvas(
      tx,
      graphId,
      { sceneNodeId: scene.id },
      position,
      fills.scene ?? DEFAULT_CANVAS_FILL,
    );
    occupied.push(position);
    fills.scene = fills.scene ?? DEFAULT_CANVAS_FILL;
    existingSceneIds.add(scene.id);
  }

  for (const [index, block] of missingBlocks.entries()) {
    const position = placeCanvasPosition({ x: 0, y: 460 + index * 460 }, occupied);
    await insertCanvas(
      tx,
      graphId,
      { blockId: block.id },
      position,
      fills.block ?? DEFAULT_CANVAS_FILL,
    );
    occupied.push(position);
    fills.block = fills.block ?? DEFAULT_CANVAS_FILL;
  }
}

async function insertCanvas(
  tx: Tx,
  graphId: string,
  owner: { sceneNodeId: string } | { blockId: string },
  position: Position,
  fill: string,
): Promise<string> {
  const canvasId = generateId("canvas");
  await tx.insert(canvases).values(
    "sceneNodeId" in owner
      ? {
          id: canvasId,
          graphId,
          sceneNodeId: owner.sceneNodeId,
          blockId: null,
          positionX: position.x,
          positionY: position.y,
        }
      : {
          id: canvasId,
          graphId,
          sceneNodeId: null,
          blockId: owner.blockId,
          positionX: position.x,
          positionY: position.y,
        },
  );
  await tx.insert(canvasElements).values({
    id: `${canvasId}-root`,
    canvasId,
    parentId: null,
    type: "frame",
    rank: "a",
    name: null,
    hidden: false,
    properties: newCanvasRootProperties(fill),
  });
  return canvasId;
}
