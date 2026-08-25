// Reading and writing a Show's graph (issue #38) — the translation between
// @mechane/domain's `ShowGraph` (what the rest of the system reasons
// about) and the four tables in ./schema.ts that store it.
//
// Kept out of the resolvers so the GraphQL layer stays a thin adapter: the
// resolvers authenticate, check ownership, validate through the domain, and
// call one of the three functions below.
import type { CanvasWorkspaceEdit, GraphEdit } from "@mechane/commands";
import { CANVAS_COMMAND_TYPES, applyCanvasEdits, applyGraphEdits } from "@mechane/commands";
import type {
  Canvas,
  FlowColor,
  GraphEdge,
  GraphNode,
  GraphState,
  SceneVariable,
  Shape,
  ShapeField,
  ShowGraph,
  Type,
} from "@mechane/domain";
import { assertValidShowGraph, emptyShowGraph, generateId, isEdgeKind } from "@mechane/domain";
import { runChannel } from "@mechane/realtime";
import { and, eq, notInArray, sql } from "drizzle-orm";
import { realtimeProvider } from "../realtime";
import type { CanvasWithOwner, StoredCanvas } from "./canvas";
import { readCanvasById, writeCanvasRows } from "./canvas";
import { db } from "./client";
import type { StoredDevice } from "./devices";
import { retireUnreferencedDevices, syncDevices } from "./devices";
import { graphNodeInsertValues } from "./graph-node-values";
import { publishPlayerUpdates, reconcileActiveRunValues, syncActiveRunSourceValues } from "./runs";
import { reconcileSceneCanvases } from "./scene-canvases";
import {
  devices,
  graphEdges,
  graphNodeVariables,
  graphNodes,
  shapeFieldRefs,
  shapeFields,
  shapes,
  showGraphs,
  shows,
  sourceFieldDefaults,
} from "./schema";
export interface PublishLoss {
  sourceId: string;
  fieldId: string;
  fieldName: string;
  path: string[];
  reason: string;
}

/** A stored graph, plus the row metadata a caller may want to show. */
export interface StoredShowGraph extends ShowGraph {
  showId: string;
  state: GraphState;
  updatedAt: Date;
  /**
   * How many writes this graph has had. A client composes an edit batch
   * against the version it last saw and sends it back, so the server can
   * tell "applied to what I have" from "applied to something else" (#103).
   */
  version: number;
  /** Data loss reported while publishing this graph, if applicable. */
  losses?: PublishLoss[];
}

/**
 * The answer to an edit batch (#111): what the next batch needs to know, and
 * anything the server decided along the way — *not* the graph.
 *
 * Answering a delta with the whole graph would be the same wholesale
 * replacement #103 removed, pointed the other way: the client composed these
 * edits against its own copy and applied them locally before sending, so all
 * it is missing is the version to build on and whatever it couldn't decide
 * for itself.
 */
export interface AppliedShowGraphEdits {
  showId: string;
  state: GraphState;
  updatedAt: Date;
  version: number;
  /** Edits the client should apply to its copy — see `amendments` below. */
  amendments: GraphEdit[];
}

/** The transaction type the graph functions run inside. */
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Anything a query can run on — the pool, or a transaction on it. Reads take
 * one so a read can be part of the same transaction as the write that
 * follows it, which is what makes read-modify-write on a graph safe (#103).
 */
type Executor = Tx | typeof db;

/**
 * An edit batch composed against a version of the graph that has since been
 * written by someone else. The batch is refused whole: applying half of a
 * cascade would leave the graph in a state no user asked for.
 */
export class GraphVersionConflictError extends Error {
  constructor(
    readonly expected: number,
    readonly actual: number,
  ) {
    super(
      `The ${expected === actual ? "" : "draft "}graph has changed since these edits were made (expected version ${expected}, found ${actual}).`,
    );
    this.name = "GraphVersionConflictError";
  }
}

type NodeRow = typeof graphNodes.$inferSelect;
type VariableRow = typeof graphNodeVariables.$inferSelect;
type EdgeRow = typeof graphEdges.$inferSelect;
type ShapeRow = typeof shapes.$inferSelect;
type ShapeFieldRow = typeof shapeFields.$inferSelect;

function toNode(
  row: NodeRow,
  variablesByScene: Map<string, SceneVariable[]>,
  deviceIdentities: Map<string, StoredDevice>,
): GraphNode {
  const base = {
    id: row.id,
    name: row.name,
    position: { x: row.positionX, y: row.positionY },
    ...(row.color ? { color: row.color as FlowColor } : {}),
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
      return {
        ...base,
        kind: "flow",
        parentId: null,
        defaultSceneId: row.defaultSceneId,
      };
    case "source":
      return {
        ...base,
        kind: "source",
        parentId: row.parentId,
        type: row.type as Type,
      };
    case "transformer":
      return {
        ...base,
        kind: "transformer",
        parentId: row.parentId,
        type: row.type as Type | null,
      };
    case "device": {
      // A Device node carries its identity rather than owning it: the row
      // in `devices` is the Show-level thing that survives publish and
      // Runs. A node with no row yet has never been through a write —
      // it reads as "code not minted", the same state a brand-new node is
      // in on the canvas.
      const identity = deviceIdentities.get(row.id);
      return {
        ...base,
        kind: "device",
        parentId: null,
        perConnection: identity?.perConnection ?? false,
        pairingCode: identity?.pairingCode ?? null,
      };
    }
    default:
      // Only reachable if a row was written around the domain validation —
      // loudly, rather than by silently dropping the node off the graph.
      throw new Error(`Stored graph node "${row.id}" has unknown kind "${row.kind}".`);
  }
}

function toShape(row: ShapeRow, fields: ShapeFieldRow[]): Shape {
  return {
    id: row.id,
    name: row.name,
    fields: fields
      .filter((field) => field.shapeId === row.id)
      .sort((a, b) => a.position - b.position)
      .map((field): ShapeField => ({
        id: field.id,
        name: field.name,
        type: field.type as Type,
        required: field.required,
        defaultValue: field.defaultValue,
      })),
  };
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
    ...(row.fieldMapping ? { fieldMapping: row.fieldMapping as Record<string, string> } : {}),
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
    variables.push({
      id: row.id,
      name: row.name,
      ...(row.rank ? { rank: row.rank } : {}),
      type: row.type as Type | undefined,
      ...(row.suggestedDimensions
        ? { suggestedDimensions: row.suggestedDimensions as { width: number; height: number } }
        : {}),
    });
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
export async function readShowGraph(
  showId: string,
  state: GraphState,
  executor: Executor = db,
): Promise<StoredShowGraph> {
  const [row] = await executor
    .select()
    .from(showGraphs)
    .where(and(eq(showGraphs.showId, showId), eq(showGraphs.state, state)));
  if (!row) {
    // The epoch stands in for "never written" — the caller renders it as
    // an empty graph either way, and a null would make every consumer
    // handle a case that isn't meaningfully different. Version 0 for the
    // same reason: an edit batch against a Show nobody has saved yet is
    // composed against nothing, and says so.
    return { ...emptyShowGraph(), showId, state, updatedAt: new Date(0), version: 0 };
  }
  // Ordered by Variable rank, then id for deterministic ties, so a graph
  // reads back in the same order the editor shows it.
  //
  // In sequence, not in parallel: `executor` may be a transaction, and a
  // transaction is one connection, which can only be running one query at a
  // time. Four small reads of one Show cost little enough that branching on
  // which executor this is would be the expensive part.
  const shapeRows = await executor
    .select()
    .from(shapes)
    .where(eq(shapes.graphId, row.id))
    .orderBy(shapes.id);
  const shapeFieldRows = await executor
    .select()
    .from(shapeFields)
    .where(eq(shapeFields.graphId, row.id))
    .orderBy(shapeFields.position);
  const nodeRows = await executor
    .select()
    .from(graphNodes)
    .where(eq(graphNodes.graphId, row.id))
    .orderBy(graphNodes.id);
  const variableRows = await executor
    .select()
    .from(graphNodeVariables)
    .where(eq(graphNodeVariables.graphId, row.id))
    .orderBy(graphNodeVariables.sceneId, graphNodeVariables.rank, graphNodeVariables.id);
  const sourceDefaultRows = await executor
    .select()
    .from(sourceFieldDefaults)
    .where(eq(sourceFieldDefaults.graphId, row.id));
  const edgeRows = await executor
    .select()
    .from(graphEdges)
    .where(eq(graphEdges.graphId, row.id))
    .orderBy(graphEdges.id);
  // Every Device on the Show, retired ones included: a published graph
  // read during a Run may well name a Device the draft has since
  // deleted, and it still has to render with its code.
  const deviceRows = await executor.select().from(devices).where(eq(devices.showId, showId));
  const variablesByScene = groupVariables(variableRows);
  const deviceIdentities = new Map(
    deviceRows.map((device) => [
      device.id,
      { pairingCode: device.pairingCode, perConnection: device.perConnection },
    ]),
  );
  return {
    showId,
    state,
    updatedAt: row.updatedAt,
    version: row.version,
    shapes: shapeRows.map((shape) => toShape(shape, shapeFieldRows)),
    sourceFieldDefaults: sourceDefaultRows.map((sourceDefault) => ({
      nodeId: sourceDefault.nodeId,
      fieldPath: sourceDefault.fieldPath,
      value: sourceDefault.value,
    })),
    nodes: nodeRows.map((node) => toNode(node, variablesByScene, deviceIdentities)),
    edges: edgeRows.map(toEdge),
  };
}

/**
 * Reconciles the Show's graph in `state` inside `tx`.
 *
 * Graph table rows are reconciled under the version lock. Scene Canvases are
 * reconciled additively by `scene-canvases.ts`, so ordinary graph edits never
 * rewrite an existing Canvas or its Element tree.
 *
 * `expectedVersion` is that check: `undefined` means "whatever is there"
 * (publish, which is a copy rather than an edit), a number means the write
 * is refused if the stored version has moved on.
 *
 * Throws `InvalidShowGraphError` before touching the database if the graph
 * isn't structurally well-formed.
 */

async function writeGraph(
  tx: Tx,
  showId: string,
  state: GraphState,
  graph: ShowGraph,
  expectedVersion?: number,
): Promise<StoredShowGraph> {
  assertValidShowGraph(graph);

  const now = new Date();
  // Locked, not just read: two batches landing at once must queue here
  // rather than both read version 3 and both write version 4.
  const [current] = await tx
    .select({ version: showGraphs.version })
    .from(showGraphs)
    .where(and(eq(showGraphs.showId, showId), eq(showGraphs.state, state)))
    .for("update");
  const currentVersion = current?.version ?? 0;
  if (expectedVersion !== undefined && expectedVersion !== currentVersion) {
    throw new GraphVersionConflictError(expectedVersion, currentVersion);
  }
  const version = currentVersion + 1;
  const [row] = await tx
    .insert(showGraphs)
    .values({ id: generateId("graph"), showId, state, version })
    .onConflictDoUpdate({
      target: [showGraphs.showId, showGraphs.state],
      set: { updatedAt: now, version },
    })
    .returning();
  if (!row) {
    // `onConflictDoUpdate ... returning()` always yields the row it
    // inserted or updated; this is here so the rest of the transaction
    // can talk about `row.id` without a non-null assertion.
    throw new Error(`Failed to upsert the ${state} graph row for Show "${showId}".`);
  }

  // Graph rows are rewritten, but retained node identities stay in place so
  // their Scene Canvases and Element trees cannot be cascaded away.
  await tx.delete(graphEdges).where(eq(graphEdges.graphId, row.id));
  await tx.delete(graphNodeVariables).where(eq(graphNodeVariables.graphId, row.id));
  await tx.delete(sourceFieldDefaults).where(eq(sourceFieldDefaults.graphId, row.id));
  const nodeIds = graph.nodes.map((node) => node.id);
  if (nodeIds.length > 0) {
    await tx
      .delete(graphNodes)
      .where(and(eq(graphNodes.graphId, row.id), notInArray(graphNodes.id, nodeIds)));
  } else {
    await tx.delete(graphNodes).where(eq(graphNodes.graphId, row.id));
  }
  await tx.delete(shapes).where(eq(shapes.graphId, row.id));
  const graphShapes = graph.shapes ?? [];
  if (graphShapes.length > 0) {
    await tx
      .insert(shapes)
      .values(graphShapes.map((shape) => ({ id: shape.id, graphId: row.id, name: shape.name })));
    const fieldRows = graphShapes.flatMap((shape) =>
      shape.fields.map((field, position) => ({
        id: field.id,
        graphId: row.id,
        shapeId: shape.id,
        name: field.name,
        position,
        type: field.type,
        required: field.required,
        defaultValue: field.defaultValue,
      })),
    );
    if (fieldRows.length > 0) await tx.insert(shapeFields).values(fieldRows);
    const refs = graphShapes.flatMap((shape) =>
      shape.fields.flatMap((field) => {
        const referenced = new Set<string>();
        const collect = (type: Type): void => {
          if (typeof type === "string") return;
          if (type.kind === "shape") referenced.add(type.shapeId);
          else if (type.kind === "array") collect(type.of);
        };
        collect(field.type);
        return [...referenced].map((referencedShapeId) => ({
          graphId: row.id,
          fieldId: field.id,
          referencedShapeId,
        }));
      }),
    );
    if (refs.length > 0) await tx.insert(shapeFieldRefs).values(refs);
  }

  // Device identity is Show-level and outlives this write (#45), so it
  // is reconciled rather than rewritten: new Devices get a row and a
  // minted code, known ones keep their code, and `perConnection` follows
  // the node so an inspector change lands. What comes back is what the
  // caller is told.
  const deviceIdentities = await syncDevices(tx, showId, graph.nodes);

  // Show-level nodes first: a nested node's `parent_id` foreign key needs
  // its Flow to already exist.
  const [topLevel, nested] = [
    graph.nodes.filter((node) => node.parentId === null),
    graph.nodes.filter((node) => node.parentId !== null),
  ];
  const upsertNodes = async (nodes: readonly GraphNode[]) => {
    if (nodes.length === 0) return;
    await tx
      .insert(graphNodes)
      .values(nodes.map((node) => graphNodeInsertValues(node, row.id)))
      .onConflictDoUpdate({
        target: [graphNodes.graphId, graphNodes.id],
        set: {
          kind: sql`excluded.${graphNodes.kind}`,
          name: sql`excluded.${graphNodes.name}`,
          parentId: sql`excluded.${graphNodes.parentId}`,
          defaultSceneId: sql`excluded.${graphNodes.defaultSceneId}`,
          color: sql`excluded.${graphNodes.color}`,
          type: sql`excluded.${graphNodes.type}`,
          positionX: sql`excluded.${graphNodes.positionX}`,
          positionY: sql`excluded.${graphNodes.positionY}`,
          updatedAt: new Date(),
        },
      });
  };
  await upsertNodes(topLevel);
  await upsertNodes(nested);
  await reconcileSceneCanvases(
    tx,
    row.id,
    graph.nodes.filter((node) => node.kind === "scene").map((node) => node.id),
  );

  const variables = graph.nodes.flatMap((node) =>
    node.kind === "scene"
      ? node.variables.map((variable, position) => ({
          id: variable.id,
          graphId: row.id,
          sceneId: node.id,
          name: variable.name,
          rank: variable.rank ?? String(position).padStart(10, "0"),
          type: variable.type ?? null,
          suggestedDimensions: variable.suggestedDimensions ?? null,
        }))
      : [],
  );
  if (variables.length > 0) {
    await tx.insert(graphNodeVariables).values(variables);
  }

  const sourceDefaults = (graph.sourceFieldDefaults ?? []).map((fieldDefault) => ({
    graphId: row.id,
    nodeId: fieldDefault.nodeId,
    fieldPath: fieldDefault.fieldPath,
    value: fieldDefault.value,
  }));
  if (sourceDefaults.length > 0) await tx.insert(sourceFieldDefaults).values(sourceDefaults);

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
        fieldMapping: edge.kind === "wiring" ? (edge.fieldMapping ?? null) : null,
        // `target_variable_id` is a generated column — the database
        // derives it from `target_path`, so it isn't written here.
        cueId: edge.kind === "navigate" ? edge.cueId : null,
        actionId: edge.kind === "navigate" ? edge.actionId : null,
      })),
    );
  }

  const nodes = graph.nodes.map((node) => {
    if (node.kind !== "device") return node;
    const identity = deviceIdentities.get(node.id);
    return identity ? { ...node, ...identity } : node;
  });

  return { showId, state, updatedAt: now, version, nodes, edges: graph.edges };
}

/**
 * Replaces the Show's graph in `state`, in a transaction of its own.
 *
 * The unconditional door into `writeGraph`, used by publish and by seeding.
 * An *edit* goes through `applyShowGraphEdits` instead, which is the one
 * that has a base version to check.
 */
export async function writeShowGraph(
  showId: string,
  state: GraphState,
  graph: ShowGraph,
): Promise<StoredShowGraph> {
  return db.transaction((tx) => writeGraph(tx, showId, state, graph));
}

/**
 * Applies `edits` to the Show's draft graph and stores the result (#103).
 *
 * This is the whole point of the delta protocol landing server-side: the
 * graph the edits apply to is read *here*, under the same lock the write
 * takes, so what the client sent is a description of a change rather than a
 * claim about the whole document. A batch composed against a stale version is
 * refused whole — never partially applied, because half a cascade is a graph
 * nobody asked for.
 *
 * The edits are applied through `@mechane/commands`, which is the same code
 * that produced them in the editor. There is no second implementation of what
 * a delete does, and therefore no way for the two to disagree.
 *
 * Throws `GraphVersionConflictError` on a stale base, `UnknownGraphTargetError`
 * on an edit naming something that isn't there, and `InvalidShowGraphError` if
 * the batch as a whole leaves the graph malformed — intermediate states are
 * not validated, because a cascade legitimately passes through them.
 */
export async function applyShowGraphEdits(
  showId: string,
  edits: readonly GraphEdit[],
  baseVersion: number,
): Promise<AppliedShowGraphEdits> {
  return db.transaction(async (tx) => {
    const current = await readShowGraph(showId, "draft", tx);
    if (current.version !== baseVersion) {
      throw new GraphVersionConflictError(baseVersion, current.version);
    }
    const next = applyGraphEdits(
      {
        shapes: current.shapes ?? [],
        sourceFieldDefaults: current.sourceFieldDefaults ?? [],
        nodes: current.nodes,
        edges: current.edges,
      },
      edits,
    );
    const written = await writeGraph(tx, showId, "draft", next, baseVersion);
    return {
      showId,
      state: written.state,
      updatedAt: written.updatedAt,
      version: written.version,
      amendments: amendments(next, written),
    };
  });
}

export interface AppliedShowEdits {
  showId: string;
  state: GraphState;
  updatedAt: Date;
  version: number;
  amendments: GraphEdit[];
  canvas: StoredCanvas | null;
}
type EditableCanvas = {
  canvas: Canvas;
  owner: CanvasWithOwner["owner"];
  position: StoredCanvas["position"];
};

/** Applies graph and Canvas edits against one shared Show version transaction.
 *
 * Source value edits also update the active Run and notify paired Players after
 * the transaction commits, so the editor and device views share live values.
 */
export async function applyShowEdits(
  showId: string,
  graphEdits: readonly GraphEdit[],
  canvasEdits: readonly CanvasWorkspaceEdit[],
  baseVersion: number,
): Promise<AppliedShowEdits> {
  const result = await db.transaction(async (tx) => {
    const current = await readShowGraph(showId, "draft", tx);
    if (current.version !== baseVersion) {
      throw new GraphVersionConflictError(baseVersion, current.version);
    }
    const canvasIds = [...new Set(canvasEdits.map((edit) => edit.canvasId))];
    const currentCanvases = new Map<string, CanvasWithOwner>();
    for (const canvasId of canvasIds) {
      const canvas = await readCanvasById(showId, "draft", canvasId, tx);
      if (!canvas) throw new Error(`Canvas "${canvasId}" was not found.`);
      currentCanvases.set(canvasId, canvas);
    }
    const nextGraph = applyGraphEdits(
      {
        shapes: current.shapes ?? [],
        sourceFieldDefaults: current.sourceFieldDefaults ?? [],
        nodes: current.nodes,
        edges: current.edges,
      },
      graphEdits,
    );
    const nextCanvases = new Map<string, EditableCanvas>(
      [...currentCanvases].map(([canvasId, currentCanvas]) => [
        canvasId,
        {
          canvas: currentCanvas.canvas,
          owner: currentCanvas.owner,
          position: { ...currentCanvas.canvas.position },
        },
      ]),
    );
    for (const edit of canvasEdits) {
      const currentCanvas = nextCanvases.get(edit.canvasId);
      if (!currentCanvas) throw new Error(`Canvas "${edit.canvasId}" was not found.`);
      const entry = nextCanvases.get(edit.canvasId)!;
      if (edit.edit.type === CANVAS_COMMAND_TYPES.moveArtboard) {
        entry.position = edit.edit.position;
      } else {
        entry.canvas = applyCanvasEdits(entry.canvas, [edit.edit]);
      }
    }
    const written = await writeGraph(tx, showId, "draft", nextGraph, baseVersion);
    const sourceEdits = graphEdits.filter(
      (edit): edit is Extract<GraphEdit, { type: "graph.setSourceFieldDefault" }> =>
        edit.type === "graph.setSourceFieldDefault",
    );
    let playerUpdated = false;
    if (sourceEdits.length > 0) {
      const published = await readShowGraph(showId, "published", tx);
      const liveSourceEdits = sourceEdits.filter((edit) =>
        published.nodes.some((node) => node.kind === "source" && node.id === edit.nodeId),
      );
      if (liveSourceEdits.length > 0) {
        const liveSourceNodeIds = new Set(liveSourceEdits.map((edit) => edit.nodeId));
        const liveGraph = applyGraphEdits(
          {
            shapes: published.shapes ?? [],
            sourceFieldDefaults: published.sourceFieldDefaults ?? [],
            nodes: published.nodes,
            edges: published.edges,
          },
          liveSourceEdits,
        );
        await writeGraph(tx, showId, "published", liveGraph);
        await syncActiveRunSourceValues(showId, liveGraph, liveSourceNodeIds, tx);
        playerUpdated = true;
      }
    }
    let storedCanvas: StoredCanvas | null = null;
    if (nextCanvases.size > 0) {
      const [graph] = await tx
        .select({ id: showGraphs.id })
        .from(showGraphs)
        .where(and(eq(showGraphs.showId, showId), eq(showGraphs.state, "draft")));
      if (!graph) throw new Error(`Draft graph for Show "${showId}" disappeared while editing.`);
      for (const [canvasId, nextCanvas] of nextCanvases) {
        await writeCanvasRows(
          tx,
          showId,
          graph.id,
          nextCanvas.owner,
          nextCanvas.canvas,
          written.updatedAt,
          nextCanvas.position,
        );
        if (canvasId === canvasIds.at(-1)) {
          storedCanvas = (await readCanvasById(showId, "draft", canvasId, tx))?.canvas ?? null;
        }
      }
    }
    return {
      showId,
      state: written.state,
      updatedAt: written.updatedAt,
      version: written.version,
      amendments: amendments(nextGraph, written),
      canvas: storedCanvas,
      playerUpdated,
    };
  });
  if (result.playerUpdated) await publishPlayerUpdates(showId);
  return result;
}

/**
 * What the server changed that the client didn't ask for, as edits the client
 * can apply to its own copy (#111).
 *
 * Today that is exactly one thing: the pairing code minted for a Device the
 * batch created (#45). The client sent a Device with no code — it can't
 * invent a unique one — and this is how it finds out.
 *
 * Expressed as a diff between the graph the *client* meant to produce and the
 * graph that was stored, so anything else the write decides for itself in
 * future is caught here rather than being quietly dropped on the floor.
 */
function amendments(intended: ShowGraph, written: StoredShowGraph): GraphEdit[] {
  const intendedById = new Map(intended.nodes.map((node) => [node.id, node]));
  const edits: GraphEdit[] = [];
  for (const node of written.nodes) {
    if (node.kind !== "device") continue;
    const before = intendedById.get(node.id);
    if (before?.kind === "device" && before.pairingCode === node.pairingCode) continue;
    edits.push({
      type: "graph.setDevicePairingCode",
      nodeId: node.id,
      pairingCode: node.pairingCode,
    });
  }
  return edits;
}

/**
 * Publishes the Show's draft graph: the published state becomes a copy of
 * the draft, immediately and for the whole Show, per ADR-0002. The draft
 * is left exactly as it is — publishing is a snapshot, not a hand-off, so
 * the director keeps editing from where they were.
 */
export async function publishShowGraph(
  showId: string,
): Promise<
  StoredShowGraph & { losses: Awaited<ReturnType<typeof reconcileActiveRunValues>>["losses"] }
> {
  const result = await db.transaction(async (tx) => {
    await tx.select({ id: shows.id }).from(shows).where(eq(shows.id, showId)).for("update");
    const draft = await readShowGraph(showId, "draft", tx);
    const publishedBefore = await readShowGraph(showId, "published", tx);
    const reconciled = await reconcileActiveRunValues(showId, publishedBefore, draft, tx);
    const published = await writeGraph(tx, showId, "published", {
      shapes: draft.shapes ?? [],
      nodes: draft.nodes,
      edges: draft.edges,
    });
    // Publish is the only moment a Device may be retired (#45). Keeping this
    // in the same transaction preserves the all-or-nothing cutover.
    await retireUnreferencedDevices(tx, showId);
    return { published, reconciled };
  });

  if (result.reconciled.runId) {
    await realtimeProvider.channel(runChannel(result.reconciled.runId)).publish("run.cutover", {
      graph: result.published,
      sourceValues: result.reconciled.sourceValues,
      losses: result.reconciled.losses,
    });
  }
  await publishPlayerUpdates(showId);

  return { ...result.published, losses: result.reconciled.losses };
}
