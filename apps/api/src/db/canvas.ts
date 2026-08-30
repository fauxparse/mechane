import type { CanvasWorkspaceEdit } from "@mechane/commands";
import { ARTBOARD_COMMAND_TYPES, applyCanvasEdits } from "@mechane/commands";
import type {
  Block,
  Canvas,
  Element,
  ElementKind,
  FrameElement,
  GraphState,
  Position,
} from "@mechane/domain";
import {
  assertValidCanvas,
  ELEMENT_KINDS,
  generateId,
  InvalidCanvasError as CanvasError,
} from "@mechane/domain";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";

import { DEFAULT_CANVAS_FILL, newCanvasRootProperties } from "./canvas-defaults";
import { placeCanvasPosition } from "./canvas-placement";
import { db } from "./client";
import { blocks, canvases, canvasElements, graphNodes, showGraphs, shows } from "./schema";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Executor = Tx | typeof db;
type CanvasOwner = { sceneNodeId: string } | { blockId: string };

export type CanvasElementValue = Element & { parentId: string | null };

export interface StoredCanvas extends Canvas {
  id: string;
  showId: string;
  state: GraphState;
  updatedAt: Date;
  version: number;
  position: Position;
  ownerId: string;
  ownerName: string;
  root: FrameElement & CanvasElementValue;
}

type CanvasElementRow = typeof canvasElements.$inferSelect;

function elementKind(value: string): ElementKind {
  if (!ELEMENT_KINDS.includes(value as ElementKind)) {
    throw new CanvasError(`element has unknown type "${value}".`);
  }
  return value as ElementKind;
}

function childrenByParent(rows: CanvasElementRow[]): Map<string | null, CanvasElementRow[]> {
  const grouped = new Map<string | null, CanvasElementRow[]>();
  for (const row of rows) {
    const children = grouped.get(row.parentId) ?? [];
    children.push(row);
    grouped.set(row.parentId, children);
  }
  for (const children of grouped.values()) {
    children.sort(
      (left, right) => left.rank.localeCompare(right.rank) || left.id.localeCompare(right.id),
    );
  }
  return grouped;
}

function toElement(
  row: CanvasElementRow,
  children: Map<string | null, CanvasElementRow[]>,
  visiting: Set<string>,
): CanvasElementValue {
  if (visiting.has(row.id)) throw new CanvasError(`element "${row.id}" contains a cycle.`);
  visiting.add(row.id);
  const properties =
    row.properties !== null && typeof row.properties === "object" && !Array.isArray(row.properties)
      ? (row.properties as Record<string, unknown>)
      : {};
  const element = {
    ...properties,
    id: row.id,
    type: elementKind(row.type),
    rank: row.rank,
    name: row.name,
    hidden: row.hidden,
    parentId: row.parentId,
    children: (children.get(row.id) ?? []).map((child) => toElement(child, children, visiting)),
  } as CanvasElementValue;
  visiting.delete(row.id);
  return element as CanvasElementValue;
}

function ownerWhere(owner: CanvasOwner, graphId: string) {
  return "sceneNodeId" in owner
    ? and(
        eq(canvases.graphId, graphId),
        eq(canvases.sceneNodeId, owner.sceneNodeId),
        isNull(canvases.blockId),
      )
    : and(
        eq(canvases.graphId, graphId),
        eq(canvases.blockId, owner.blockId),
        isNull(canvases.sceneNodeId),
      );
}

/** Reads a Canvas tree from its relational rows in one graph state. */
export async function readCanvas(
  showId: string,
  state: GraphState,
  owner: CanvasOwner,
  executor: Executor = db,
): Promise<StoredCanvas | null> {
  const [graph] = await executor
    .select({ id: showGraphs.id, version: showGraphs.version, updatedAt: showGraphs.updatedAt })
    .from(showGraphs)
    .where(and(eq(showGraphs.showId, showId), eq(showGraphs.state, state)));
  if (!graph) return null;

  const [canvas] = await executor.select().from(canvases).where(ownerWhere(owner, graph.id));
  if (!canvas) return null;

  const ownerId = "sceneNodeId" in owner ? owner.sceneNodeId : owner.blockId;
  const [ownerRow] =
    "sceneNodeId" in owner
      ? await executor
          .select({ id: graphNodes.id, name: graphNodes.name })
          .from(graphNodes)
          .where(and(eq(graphNodes.graphId, graph.id), eq(graphNodes.id, owner.sceneNodeId)))
      : await executor
          .select({ id: blocks.id, name: blocks.name })
          .from(blocks)
          .where(and(eq(blocks.graphId, graph.id), eq(blocks.id, owner.blockId)));
  if (!ownerRow) throw new CanvasError(`Canvas "${canvas.id}" has no persisted owner.`);
  const rows = await executor
    .select()
    .from(canvasElements)
    .where(eq(canvasElements.canvasId, canvas.id))
    .orderBy(asc(canvasElements.rank), asc(canvasElements.id));
  const grouped = childrenByParent(rows);
  const roots = grouped.get(null) ?? [];
  if (roots.length !== 1) {
    throw new CanvasError(`Canvas "${canvas.id}" must have exactly one root Element.`);
  }
  const root = toElement(roots[0]!, grouped, new Set<string>());
  if (root.type !== "frame") {
    throw new CanvasError(`Canvas "${canvas.id}" root must be a Frame.`);
  }
  const result = {
    id: canvas.id,
    showId,
    state,
    version: graph.version,
    updatedAt: graph.updatedAt,
    position: { x: canvas.positionX, y: canvas.positionY },
    kind: canvas.sceneNodeId ? "scene" : "block",
    ownerId,
    ownerName: ownerRow.name,
    root: root as FrameElement & CanvasElementValue,
  } satisfies StoredCanvas;
  assertValidCanvas(result);
  return result;
}

/** Reads the owned Canvas for each Block in a graph. */
export async function readBlockCanvases(
  showId: string,
  state: GraphState,
  blockIds: readonly string[],
  executor: Executor = db,
): Promise<ReadonlyMap<string, StoredCanvas>> {
  const result = new Map<string, StoredCanvas>();
  for (const blockId of blockIds) {
    const canvas = await readCanvas(showId, state, { blockId }, executor);
    if (!canvas) throw new Error(`Block "${blockId}" has no owned Canvas.`);
    result.set(blockId, canvas);
  }
  return result;
}

export interface CanvasWorkspaceRead {
  readonly canvases: readonly StoredCanvas[];
}

/** Reads every persisted Scene and Block Canvas for one Show state. */
export async function readCanvasWorkspace(
  showId: string,
  state: GraphState,
  executor: Executor = db,
): Promise<CanvasWorkspaceRead> {
  const [graph] = await executor
    .select({ id: showGraphs.id })
    .from(showGraphs)
    .where(and(eq(showGraphs.showId, showId), eq(showGraphs.state, state)));
  if (!graph) return { canvases: [] };
  const rows = await executor
    .select({
      id: canvases.id,
      sceneNodeId: canvases.sceneNodeId,
      blockId: canvases.blockId,
    })
    .from(canvases)
    .where(eq(canvases.graphId, graph.id))
    .orderBy(asc(canvases.id));
  const loaded: StoredCanvas[] = [];
  for (const row of rows) {
    const owner = row.sceneNodeId
      ? { sceneNodeId: row.sceneNodeId }
      : row.blockId
        ? { blockId: row.blockId }
        : null;
    if (!owner) throw new CanvasError(`Canvas "${row.id}" has no owner.`);
    const canvas = await readCanvas(showId, state, owner, executor);
    if (canvas) loaded.push(canvas);
  }
  return { canvases: loaded };
}

export interface CanvasWithOwner {
  canvas: StoredCanvas;
  owner: CanvasOwner;
}

/** Reads a Canvas by id and returns the owner needed by write operations. */
export async function readCanvasById(
  showId: string,
  state: GraphState,
  canvasId: string,
  executor: Executor = db,
): Promise<CanvasWithOwner | null> {
  const [graph] = await executor
    .select({ id: showGraphs.id })
    .from(showGraphs)
    .where(and(eq(showGraphs.showId, showId), eq(showGraphs.state, state)));
  if (!graph) return null;
  const [row] = await executor
    .select({ sceneNodeId: canvases.sceneNodeId, blockId: canvases.blockId })
    .from(canvases)
    .where(and(eq(canvases.id, canvasId), eq(canvases.graphId, graph.id)));
  if (!row) return null;
  const owner = row.sceneNodeId
    ? { sceneNodeId: row.sceneNodeId }
    : row.blockId
      ? { blockId: row.blockId }
      : null;
  if (!owner) throw new CanvasError(`Canvas "${canvasId}" has no owner.`);
  const canvas = await readCanvas(showId, state, owner, executor);
  return canvas ? { canvas, owner } : null;
}

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
          .select({ id: graphNodes.id })
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
  const scenePositions = new Map(
    existingCanvases
      .filter((canvas) => canvas.sceneNodeId !== null)
      .map((canvas) => [
        canvas.sceneNodeId!,
        { x: canvas.positionX, y: canvas.positionY } satisfies Position,
      ]),
  );
  const sceneIndexes = new Map(sceneIds.map((sceneId, index) => [sceneId, index]));

  for (const scene of sceneRows) {
    if (existingSceneIds.has(scene.id)) continue;
    const sceneIndex = sceneIndexes.get(scene.id) ?? 0;
    const previousScene = [...sceneIndexes]
      .filter(([, index]) => index < sceneIndex)
      .sort(([, left], [, right]) => right - left)
      .map(([sceneId]) => scenePositions.get(sceneId))
      .find((position) => position);
    const preferred = previousScene
      ? { x: previousScene.x + 760, y: previousScene.y }
      : { x: 0, y: 0 };
    const position = placeCanvasPosition(preferred, occupied);
    await insertCanvas(
      tx,
      graphId,
      { sceneNodeId: scene.id },
      position,
      fills.scene ?? DEFAULT_CANVAS_FILL,
    );
    occupied.push(position);
    scenePositions.set(scene.id, position);
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

export class CanvasVersionConflictError extends Error {
  constructor(
    readonly expected: number,
    readonly actual: number,
  ) {
    super(`Canvas version conflict: expected ${expected}, found ${actual}.`);
    this.name = "CanvasVersionConflictError";
  }
}

interface CanvasElementInsert {
  id: string;
  canvasId: string;
  parentId: string | null;
  type: ElementKind;
  rank: string;
  name: string | null;
  hidden: boolean;
  properties: Record<string, unknown>;
}

function elementRow(
  canvasId: string,
  element: Element & { parentId?: string | null },
  parentId: string | null,
  rank: string,
): CanvasElementInsert {
  const {
    id,
    type,
    name,
    hidden,
    children: _children,
    parentId: _parentId,
    rank: _rank,
    ...properties
  } = element as Element & { parentId?: string | null };
  return {
    id,
    canvasId,
    parentId,
    type,
    rank,
    name: name ?? null,
    hidden: hidden ?? false,
    properties,
  };
}

function elementRows(
  canvasId: string,
  element: Element & { parentId?: string | null },
  parentId: string | null,
  rank: string,
): CanvasElementInsert[] {
  return [
    elementRow(canvasId, element, parentId, rank),
    ...(element.children ?? []).flatMap((child) =>
      elementRows(canvasId, child, element.id, child.rank ?? ""),
    ),
  ];
}

export async function writeCanvasRows(
  tx: Tx,
  showId: string,
  graphId: string,
  owner: CanvasOwner,
  canvas: Canvas,
  now: Date,
  position?: Position,
): Promise<string> {
  const canonical = canvas;
  const [existing] = await tx.select().from(canvases).where(ownerWhere(owner, graphId));
  const identified = canonical as Canvas & { id?: unknown };
  const requestedId = typeof identified.id === "string" ? identified.id : undefined;
  const [idCollision] =
    !existing && requestedId
      ? await tx.select({ id: canvases.id }).from(canvases).where(eq(canvases.id, requestedId))
      : [];
  const canvasId =
    existing?.id ?? (idCollision ? generateId("canvas") : requestedId) ?? generateId("canvas");
  const nextPosition = position ?? {
    x: existing?.positionX ?? 0,
    y: existing?.positionY ?? 0,
  };
  if (existing) {
    await tx.delete(canvasElements).where(eq(canvasElements.canvasId, existing.id));
    await tx
      .update(canvases)
      .set({
        positionX: nextPosition.x,
        positionY: nextPosition.y,
        updatedAt: now,
      })
      .where(eq(canvases.id, existing.id));
  } else {
    await tx.insert(canvases).values(
      "sceneNodeId" in owner
        ? {
            id: canvasId,
            graphId,
            sceneNodeId: owner.sceneNodeId,
            blockId: null,
            positionX: nextPosition.x,
            positionY: nextPosition.y,
          }
        : {
            id: canvasId,
            graphId,
            sceneNodeId: null,
            blockId: owner.blockId,
            positionX: nextPosition.x,
            positionY: nextPosition.y,
          },
    );
  }
  await tx
    .insert(canvasElements)
    .values(elementRows(canvasId, canonical.root, null, canonical.root.rank ?? ""));
  await tx.update(shows).set({ updatedAt: now }).where(eq(shows.id, showId));
  return canvasId;
}

interface PendingCanvas {
  canvas: Canvas;
  owner: CanvasOwner;
  position: Position;
}

export interface PersistCanvasesOptions {
  showId: string;
  state: GraphState;
  graphId: string;
  blocks: readonly Block[];
  sceneIds: readonly string[];
  edits: readonly CanvasWorkspaceEdit[];
  now: Date;
  forceBlockWrites?: boolean;
}

/**
 * Persists the Canvases owned by a graph and applies targeted workspace edits.
 * Existing Block Canvases are untouched unless the caller is copying a graph
 * state or an edit targets them; newly-created Blocks always get their Canvas.
 */
export async function persistCanvases(tx: Tx, options: PersistCanvasesOptions): Promise<void> {
  const {
    showId,
    state,
    graphId,
    blocks: blockDefinitions,
    sceneIds,
    edits,
    now,
    forceBlockWrites = false,
  } = options;
  const existingCanvases = await tx
    .select({ blockId: canvases.blockId })
    .from(canvases)
    .where(eq(canvases.graphId, graphId));
  const existingBlockIds = new Set(
    existingCanvases.flatMap((canvas) => (canvas.blockId ? [canvas.blockId] : [])),
  );
  const blocksByCanvasId = new Map<string, Block>(
    blockDefinitions.map((block) => [block.canvas.id, block]),
  );
  const pending = new Map<string, PendingCanvas>();

  for (const workspaceEdit of edits) {
    let entry = pending.get(workspaceEdit.canvasId);
    if (!entry) {
      const block = blocksByCanvasId.get(workspaceEdit.canvasId);
      if (block) {
        entry = {
          canvas: block.canvas,
          owner: { blockId: block.id },
          position: block.canvas.position ?? { x: 0, y: 0 },
        };
      } else {
        const stored = await readCanvasById(showId, state, workspaceEdit.canvasId, tx);
        if (!stored) throw new Error(`Canvas "${workspaceEdit.canvasId}" was not found.`);
        entry = {
          canvas: stored.canvas,
          owner: stored.owner,
          position: { ...stored.canvas.position },
        };
      }
      pending.set(workspaceEdit.canvasId, entry);
    }

    if (workspaceEdit.edit.type === ARTBOARD_COMMAND_TYPES.move) {
      entry.position = workspaceEdit.edit.position;
    } else {
      entry.canvas = applyCanvasEdits(entry.canvas, [workspaceEdit.edit]);
    }
  }

  for (const block of blockDefinitions) {
    const edited = pending.get(block.canvas.id);
    if (!forceBlockWrites && existingBlockIds.has(block.id) && !edited) continue;
    await writeCanvasRows(
      tx,
      showId,
      graphId,
      { blockId: block.id },
      edited?.canvas ?? block.canvas,
      now,
      edited?.position ?? block.canvas.position,
    );
  }

  for (const edited of pending.values()) {
    if ("blockId" in edited.owner) continue;
    await writeCanvasRows(tx, showId, graphId, edited.owner, edited.canvas, now, edited.position);
  }

  await reconcileSceneCanvases(tx, graphId, sceneIds);
}

async function writeCanvasInTransaction(
  tx: Tx,
  showId: string,
  state: GraphState,
  owner: CanvasOwner,
  canvas: Canvas,
  expectedVersion?: number,
): Promise<StoredCanvas> {
  assertValidCanvas(canvas);
  const now = new Date();
  const [current] = await tx
    .select({ id: showGraphs.id, version: showGraphs.version })
    .from(showGraphs)
    .where(and(eq(showGraphs.showId, showId), eq(showGraphs.state, state)))
    .for("update");
  const currentVersion = current?.version ?? 0;
  if (expectedVersion !== undefined && expectedVersion !== currentVersion) {
    throw new CanvasVersionConflictError(expectedVersion, currentVersion);
  }
  const version = currentVersion + 1;
  const [graph] = await tx
    .insert(showGraphs)
    .values({ id: generateId("graph"), showId, state, version })
    .onConflictDoUpdate({
      target: [showGraphs.showId, showGraphs.state],
      set: { updatedAt: now, version },
    })
    .returning({ id: showGraphs.id });
  if (!graph) throw new Error(`Failed to upsert the ${state} graph row for Show "${showId}".`);

  const canvasId = await writeCanvasRows(tx, showId, graph.id, owner, canvas, now);
  const stored = await readCanvas(showId, state, owner, tx);
  if (!stored) throw new Error(`Canvas "${canvasId}" disappeared while it was being written.`);
  return stored;
}

/** Replaces one Canvas tree after checking the graph version under a row lock. */
export async function writeCanvas(
  showId: string,
  state: GraphState,
  owner: CanvasOwner,
  canvas: Canvas,
  expectedVersion?: number,
): Promise<StoredCanvas> {
  return db.transaction((tx) =>
    writeCanvasInTransaction(tx, showId, state, owner, canvas, expectedVersion),
  );
}

export type { CanvasOwner };
