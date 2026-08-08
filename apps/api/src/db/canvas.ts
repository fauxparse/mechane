import type { Canvas, Element, ElementKind, FrameElement, GraphState } from "@mechane/domain";
import {
  assertValidCanvas,
  ELEMENT_KINDS,
  InvalidCanvasError as CanvasError,
} from "@mechane/domain";
import { and, asc, eq, isNull } from "drizzle-orm";

import { db } from "./client";
import { canvases, canvasElements, showGraphs } from "./schema";

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

export type { CanvasOwner };
