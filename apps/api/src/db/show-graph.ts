// Reading and writing a Show's graph (issue #38) — the translation between
// @presence/domain's `ShowGraph` (what the rest of the system reasons
// about) and the four tables in ./schema.ts that store it.
//
// Kept out of the resolvers so the GraphQL layer stays a thin adapter: the
// resolvers authenticate, check ownership, validate through the domain, and
// call one of the three functions below.
import type { GraphEdge, GraphNode, GraphState, SceneVariable, ShowGraph } from "@presence/domain";
import { assertValidShowGraph, emptyShowGraph, generateId, isEdgeKind } from "@presence/domain";
import { and, eq } from "drizzle-orm";

import { db } from "./client";
import { graphEdges, graphNodeVariables, graphNodes, showGraphs } from "./schema";

/** A stored graph, plus the row metadata a caller may want to show. */
export interface StoredShowGraph extends ShowGraph {
  showId: string;
  state: GraphState;
  updatedAt: Date;
}

type NodeRow = typeof graphNodes.$inferSelect;
type VariableRow = typeof graphNodeVariables.$inferSelect;
type EdgeRow = typeof graphEdges.$inferSelect;

function toNode(row: NodeRow, variablesByScene: Map<string, SceneVariable[]>): GraphNode {
  const base = {
    id: row.id,
    name: row.name,
    position: { x: row.positionX, y: row.positionY },
  };
  switch (row.kind) {
    case "scene":
      return {
        ...base,
        kind: "scene",
        parentId: row.parentId,
        variables: variablesByScene.get(row.id) ?? [],
      };
    case "flow":
      return { ...base, kind: "flow", parentId: null, defaultSceneId: row.defaultSceneId };
    case "source":
      return { ...base, kind: "source", parentId: row.parentId };
    case "transformer":
      return { ...base, kind: "transformer", parentId: row.parentId };
    case "device":
      return { ...base, kind: "device", parentId: null };
    default:
      // Only reachable if a row was written around the domain validation —
      // loudly, rather than by silently dropping the node off the canvas.
      throw new Error(`Stored graph node "${row.id}" has unknown kind "${row.kind}".`);
  }
}

function toEdge(row: EdgeRow): GraphEdge {
  if (!isEdgeKind(row.kind)) {
    throw new Error(`Stored graph edge "${row.id}" has unknown kind "${row.kind}".`);
  }
  const base = {
    id: row.id,
    sourceId: row.sourceNodeId,
    targetId: row.targetNodeId,
    sourcePath: row.sourcePath,
    targetPath: row.targetPath,
  };
  switch (row.kind) {
    case "wiring":
      return { ...base, kind: "wiring" };
    case "navigate":
      return { ...base, kind: "navigate", cueId: row.cueId, actionId: row.actionId };
    case "device":
      return { ...base, kind: "device" };
  }
}

function groupVariables(rows: VariableRow[]): Map<string, SceneVariable[]> {
  const bySceneId = new Map<string, SceneVariable[]>();
  for (const row of rows) {
    const variables = bySceneId.get(row.sceneId) ?? [];
    variables.push({ id: row.id, name: row.name });
    bySceneId.set(row.sceneId, variables);
  }
  return bySceneId;
}

/**
 * The Show's graph in `state`. A Show that has never been edited (or never
 * published) has no row yet — that reads as the empty graph rather than an
 * error, since "no Flows, no Scenes" is a valid Show (#25), not a missing
 * one.
 */
export async function readShowGraph(showId: string, state: GraphState): Promise<StoredShowGraph> {
  const [row] = await db
    .select()
    .from(showGraphs)
    .where(and(eq(showGraphs.showId, showId), eq(showGraphs.state, state)));
  if (!row) {
    // The epoch stands in for "never written" — the caller renders it as
    // an empty canvas either way, and a null would make every consumer
    // handle a case that isn't meaningfully different.
    return { ...emptyShowGraph(), showId, state, updatedAt: new Date(0) };
  }
  // Ordered by id so a graph reads back the same way twice — the canvas
  // doesn't care, but a diff of two reads (or a test) does.
  const [nodeRows, variableRows, edgeRows] = await Promise.all([
    db.select().from(graphNodes).where(eq(graphNodes.graphId, row.id)).orderBy(graphNodes.id),
    db
      .select()
      .from(graphNodeVariables)
      .where(eq(graphNodeVariables.graphId, row.id))
      .orderBy(graphNodeVariables.id),
    db.select().from(graphEdges).where(eq(graphEdges.graphId, row.id)).orderBy(graphEdges.id),
  ]);
  const variablesByScene = groupVariables(variableRows);
  return {
    showId,
    state,
    updatedAt: row.updatedAt,
    nodes: nodeRows.map((node) => toNode(node, variablesByScene)),
    edges: edgeRows.map(toEdge),
  };
}

/**
 * Replaces the Show's graph in `state` with `graph`, wholesale, inside one
 * transaction. Whole-graph replacement rather than per-node CRUD because
 * the editor's unit of work is "the canvas as it now stands" — fine-grained
 * commands are issue #42's, and they can layer on top of this.
 *
 * Throws `InvalidShowGraphError` before touching the database if the graph
 * isn't structurally well-formed.
 */
export async function writeShowGraph(
  showId: string,
  state: GraphState,
  graph: ShowGraph,
): Promise<StoredShowGraph> {
  assertValidShowGraph(graph);

  return db.transaction(async (tx) => {
    const now = new Date();
    const [row] = await tx
      .insert(showGraphs)
      .values({ id: generateId("graph"), showId, state })
      .onConflictDoUpdate({
        target: [showGraphs.showId, showGraphs.state],
        set: { updatedAt: now },
      })
      .returning();
    if (!row) {
      // `onConflictDoUpdate ... returning()` always yields the row it
      // inserted or updated; this is here so the rest of the transaction
      // can talk about `row.id` without a non-null assertion.
      throw new Error(`Failed to upsert the ${state} graph row for Show "${showId}".`);
    }

    // Cascades take the nodes' variables and edges with them, so this is
    // the only delete needed to empty the graph.
    await tx.delete(graphNodes).where(eq(graphNodes.graphId, row.id));

    // Show-level nodes first: a nested node's `parent_id` foreign key needs
    // its Flow to already exist.
    const [topLevel, nested] = [
      graph.nodes.filter((node) => node.parentId === null),
      graph.nodes.filter((node) => node.parentId !== null),
    ];
    for (const nodes of [topLevel, nested]) {
      if (nodes.length === 0) continue;
      await tx.insert(graphNodes).values(
        nodes.map((node) => ({
          id: node.id,
          graphId: row.id,
          kind: node.kind,
          name: node.name,
          parentId: node.parentId,
          positionX: node.position.x,
          positionY: node.position.y,
        })),
      );
    }

    // A Flow's default Scene is one of its own children, so it can only be
    // set once those children exist.
    for (const node of graph.nodes) {
      if (node.kind !== "flow" || node.defaultSceneId === null) continue;
      await tx
        .update(graphNodes)
        .set({ defaultSceneId: node.defaultSceneId })
        .where(eq(graphNodes.id, node.id));
    }

    const variables = graph.nodes.flatMap((node) =>
      node.kind === "scene"
        ? node.variables.map((variable) => ({
            id: variable.id,
            graphId: row.id,
            sceneId: node.id,
            name: variable.name,
          }))
        : [],
    );
    if (variables.length > 0) {
      await tx.insert(graphNodeVariables).values(variables);
    }

    if (graph.edges.length > 0) {
      await tx.insert(graphEdges).values(
        graph.edges.map((edge) => ({
          id: edge.id,
          graphId: row.id,
          kind: edge.kind,
          sourceNodeId: edge.sourceId,
          targetNodeId: edge.targetId,
          sourcePath: edge.sourcePath,
          targetPath: edge.targetPath,
          // `target_variable_id` is a generated column — the database
          // derives it from `target_path`, so it isn't written here.
          cueId: edge.kind === "navigate" ? edge.cueId : null,
          actionId: edge.kind === "navigate" ? edge.actionId : null,
        })),
      );
    }

    return { showId, state, updatedAt: now, nodes: graph.nodes, edges: graph.edges };
  });
}

/**
 * Publishes the Show's draft graph: the published state becomes a copy of
 * the draft, immediately and for the whole Show, per ADR-0002. The draft
 * is left exactly as it is — publishing is a snapshot, not a hand-off, so
 * the director keeps editing from where they were.
 */
export async function publishShowGraph(showId: string): Promise<StoredShowGraph> {
  const draft = await readShowGraph(showId, "draft");
  return writeShowGraph(showId, "published", { nodes: draft.nodes, edges: draft.edges });
}
