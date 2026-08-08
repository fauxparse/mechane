import type { Canvas, Element, ElementKind, FrameElement, GraphState } from "@mechane/domain";
import {
  assertValidCanvas,
  ELEMENT_KINDS,
  generateId,
  InvalidCanvasError as CanvasError,
} from "@mechane/domain";
import { and, asc, eq, isNull } from "drizzle-orm";

import { db } from "./client";
import { canvases, canvasElements, showGraphs, shows } from "./schema";

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
  return element;
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
    kind: canvas.sceneNodeId ? "scene" : "block",
    root: root as FrameElement & CanvasElementValue,
  } satisfies StoredCanvas;
  assertValidCanvas(result);
  return result;
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

  const [existing] = await tx.select().from(canvases).where(ownerWhere(owner, graph.id));
  const canvasId = existing?.id ?? generateId("canvas");
  if (existing) {
    await tx.delete(canvasElements).where(eq(canvasElements.canvasId, existing.id));
  } else {
    await tx
      .insert(canvases)
      .values(
        "sceneNodeId" in owner
          ? { id: canvasId, graphId: graph.id, sceneNodeId: owner.sceneNodeId, blockId: null }
          : { id: canvasId, graphId: graph.id, sceneNodeId: null, blockId: owner.blockId },
      );
  }
  await tx
    .insert(canvasElements)
    .values(elementRows(canvasId, canvas.root, null, canvas.root.rank ?? ""));
  await tx.update(shows).set({ updatedAt: now }).where(eq(shows.id, showId));
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
