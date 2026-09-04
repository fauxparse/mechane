// Focused graph-row persistence for Show edits (#372).
//
// This module owns the graph tables, their domain mapping, and the version
// lock. Canvas reconciliation, Device identity, publication, and live Run
// effects are coordinated by show-graph.ts around this seam.
import type {
  Action,
  Block,
  BlockState,
  BlockVariable,
  Cue,
  EdgeLayout,
  EventBinding,
  FlowColor,
  FlowSize,
  GraphEdge,
  GraphNode,
  GraphState,
  InteractionCollections,
  SceneVariable,
  Shape,
  ShapeField,
  ShowGraph,
  Type,
} from "@mechane/domain";
import {
  assertValidShowGraph,
  decodeEventBinding,
  emptyShowGraph,
  generateId,
  InvalidInteractionError,
  isEdgeKind,
  isWiringConversion,
  normalizeShapeCollectionInstances,
  projectNavigateEdges,
  typeAtPath,
} from "@mechane/domain";
import { and, eq, notInArray, sql } from "drizzle-orm";

import { db } from "./client";
import { readBlockCanvases } from "./canvas";
import type { StoredDevice } from "./devices";
import { graphNodeInsertValues } from "./graph-node-values";
import {
  blocks,
  canvases,
  graphActions as graphActionsTable,
  graphCues as graphCuesTable,
  graphEdges,
  graphEventBindings,
  graphNodeVariables,
  graphNodes,
  shapeFieldRefs,
  shapeFields,
  shapes,
  showGraphs,
  sourceFieldDefaults,
} from "./schema";

export interface PersistedGraph extends ShowGraph {
  showId: string;
  state: GraphState;
  updatedAt: Date;
  version: number;
}

export interface PersistedGraphWrite {
  graphId: string;
  graph: PersistedGraph;
}

/** The transaction type every graph-row operation runs inside. */
export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Anything a graph read can run on: the pool or an enclosing transaction. */
export type Executor = Tx | typeof db;
type CueRow = typeof graphCuesTable.$inferSelect;
type ActionRow = typeof graphActionsTable.$inferSelect;
type EventBindingRow = typeof graphEventBindings.$inferSelect;

function toAction(row: ActionRow): Action {
  if (row.kind !== "navigate") {
    throw new Error(`Stored Action "${row.id}" has unknown kind "${row.kind}".`);
  }
  return {
    id: row.id,
    cueId: row.cueId,
    kind: "navigate",
    targetSceneId: row.targetSceneId,
  };
}

function toCue(row: CueRow, actionRows: readonly ActionRow[]): Cue {
  const actionIds = actionRows
    .filter((action) => action.cueId === row.id)
    .sort((left, right) => left.position - right.position)
    .map((action) => action.id);
  const owner =
    row.sceneId !== null
      ? { kind: "scene" as const, sceneId: row.sceneId }
      : row.blockId !== null
        ? { kind: "block" as const, blockId: row.blockId }
        : null;
  if (!owner) throw new Error(`Stored Cue "${row.id}" has no owner.`);
  return {
    id: row.id,
    name: row.name,
    owner,
    actionIds,
  };
}

function toEventBinding(row: EventBindingRow): EventBinding {
  try {
    return decodeEventBinding(row);
  } catch (error) {
    // Stored rows are trusted-ish, so a bad one is a data problem rather than
    // a caller problem; report it as this layer's error, not the domain's.
    if (error instanceof InvalidInteractionError) {
      throw new Error(`Stored Event Binding "${row.id}" is invalid: ${error.message}`);
    }
    throw error;
  }
}

function readInteractions(
  cueRows: readonly CueRow[],
  actionRows: readonly ActionRow[],
  bindingRows: readonly EventBindingRow[],
): InteractionCollections {
  return {
    cues: cueRows.map((row) => toCue(row, actionRows)),
    actions: actionRows.map(toAction),
    eventBindings: bindingRows.map(toEventBinding),
  };
}

type NodeRow = typeof graphNodes.$inferSelect;
type VariableRow = typeof graphNodeVariables.$inferSelect;
type EdgeRow = typeof graphEdges.$inferSelect;
type ShapeRow = typeof shapes.$inferSelect;
type ShapeFieldRow = typeof shapeFields.$inferSelect;

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

function toNode(
  row: NodeRow,
  variablesByScene: Map<string, SceneVariable[]>,
  deviceIdentities: ReadonlyMap<string, StoredDevice>,
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
        ...(row.size ? { size: row.size as FlowSize } : {}),
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
    ...(row.layout ? { layout: row.layout as EdgeLayout } : {}),
  };
  switch (row.kind) {
    case "wiring":
      return {
        ...base,
        kind: "wiring",
        // An unrecognised stored conversion is dropped rather than carried:
        // the edge then fails the ordinary type rules and says so, instead of
        // claiming a conversion nothing can perform.
        ...(row.conversion && isWiringConversion(row.conversion)
          ? { conversion: row.conversion }
          : {}),
      };
    case "navigate":
      return { ...base, kind: "navigate", cueId: row.cueId, actionId: row.actionId };
    case "device":
      return { ...base, kind: "device" };
  }
  const unreachable: never = row.kind;
  throw new Error(`Stored graph edge "${row.id}" has unknown kind "${unreachable}".`);
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

function blockMetadata(block: typeof blocks.$inferSelect): {
  variables: BlockVariable[];
  states: BlockState[];
  stateSelectorVariableId: string | null;
} {
  const metadata =
    block.metadata !== null && typeof block.metadata === "object" && !Array.isArray(block.metadata)
      ? (block.metadata as Record<string, unknown>)
      : {};
  return {
    variables: Array.isArray(metadata.variables) ? (metadata.variables as BlockVariable[]) : [],
    states: Array.isArray(metadata.states) ? (metadata.states as BlockState[]) : [],
    stateSelectorVariableId:
      typeof metadata.stateSelectorVariableId === "string"
        ? metadata.stateSelectorVariableId
        : null,
  };
}

async function readBlocks(
  showId: string,
  state: GraphState,
  graphId: string,
  executor: Executor,
): Promise<Block[]> {
  const rows = await executor
    .select()
    .from(blocks)
    .where(eq(blocks.graphId, graphId))
    .orderBy(blocks.id);
  const blockCanvases = await readBlockCanvases(
    showId,
    state,
    rows.map((row) => row.id),
    executor,
  );
  const result: Block[] = [];
  for (const row of rows) {
    const canvas = blockCanvases.get(row.id);
    if (!canvas) throw new Error(`Block "${row.id}" has no owned Canvas.`);
    const metadata = blockMetadata(row);
    result.push({
      id: row.id,
      name: row.name,
      canvas,
      variables: metadata.variables,
      states: metadata.states,
      stateSelectorVariableId: metadata.stateSelectorVariableId,
    });
  }
  return result;
}

/**
 * The Show's graph in `state`. A Show that has never been edited (or never
 * published) has no row yet — that reads as the empty graph rather than an
 * error, since "no Flows, no Scenes" is a valid Show (#25), not a missing
 * one.
 */
export async function readGraphRows(
  showId: string,
  state: GraphState,
  deviceIdentities: ReadonlyMap<string, StoredDevice> = new Map(),
  executor: Executor = db,
): Promise<PersistedGraph> {
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
  const cueRows = await executor
    .select()
    .from(graphCuesTable)
    .where(eq(graphCuesTable.graphId, row.id))
    .orderBy(graphCuesTable.id);
  const actionRows = await executor
    .select()
    .from(graphActionsTable)
    .where(eq(graphActionsTable.graphId, row.id))
    .orderBy(graphActionsTable.cueId, graphActionsTable.position);
  const bindingRows = await executor
    .select()
    .from(graphEventBindings)
    .where(eq(graphEventBindings.graphId, row.id))
    .orderBy(
      graphEventBindings.canvasId,
      graphEventBindings.elementId,
      graphEventBindings.position,
      graphEventBindings.id,
    );
  const interactions = readInteractions(cueRows, actionRows, bindingRows);
  const blockValues = await readBlocks(showId, state, row.id, executor);
  const variablesByScene = groupVariables(variableRows);
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
    blocks: blockValues,
    ...interactions,
    nodes: nodeRows.map((node) => toNode(node, variablesByScene, deviceIdentities)),
    edges: edgeRows.map(toEdge),
  };
}
/**
 * Persists the graph rows and version under one transaction lock.
 *
 * Canvas reconciliation, Device identity, and live lifecycle effects belong
 * to the caller so this seam can be tested without those side effects.
 */

export async function persistGraphRows(
  tx: Tx,
  showId: string,
  state: GraphState,
  graph: ShowGraph,
  expectedVersion?: number,
): Promise<PersistedGraphWrite> {
  const sourceNodes = new Map(
    graph.nodes
      .filter((node): node is Extract<GraphNode, { kind: "source" }> => node.kind === "source")
      .map((node) => [node.id, node]),
  );
  const projectedNavigateEdges = projectNavigateEdges(graph);
  graph = {
    ...graph,
    cues: graph.cues ?? [],
    actions: graph.actions ?? [],
    eventBindings: graph.eventBindings ?? [],
    edges: [...graph.edges.filter((edge) => edge.kind !== "navigate"), ...projectedNavigateEdges],
    sourceFieldDefaults: graph.sourceFieldDefaults?.map((sourceDefault) => {
      const source = sourceNodes.get(sourceDefault.nodeId);
      const type = source
        ? typeAtPath(source.type, sourceDefault.fieldPath, graph.shapes ?? [])
        : null;
      return type
        ? {
            ...sourceDefault,
            value: normalizeShapeCollectionInstances(sourceDefault.value, type, graph.shapes ?? []),
          }
        : sourceDefault;
    }),
  };
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
  await tx.delete(graphEventBindings).where(eq(graphEventBindings.graphId, row.id));
  await tx.delete(graphCuesTable).where(eq(graphCuesTable.graphId, row.id));
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

  const graphBlocks = graph.blocks ?? [];
  const blockIds = graphBlocks.map((block) => block.id);
  if (blockIds.length > 0) {
    await tx.delete(blocks).where(and(eq(blocks.graphId, row.id), notInArray(blocks.id, blockIds)));
  } else {
    await tx.delete(blocks).where(eq(blocks.graphId, row.id));
  }
  for (const block of graphBlocks) {
    const metadata = {
      variables: block.variables,
      states: block.states,
      stateSelectorVariableId: block.stateSelectorVariableId ?? null,
    };
    await tx
      .insert(blocks)
      .values({ id: block.id, graphId: row.id, name: block.name, metadata })
      .onConflictDoUpdate({
        target: [blocks.graphId, blocks.id],
        set: { name: block.name, metadata, updatedAt: now },
      });
  }

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
          kind: sql.raw("excluded.kind"),
          name: sql.raw("excluded.name"),
          parentId: sql.raw("excluded.parent_id"),
          defaultSceneId: sql.raw("excluded.default_scene_id"),
          size: sql.raw("excluded.size"),
          color: sql.raw("excluded.color"),
          type: sql.raw("excluded.type"),
          positionX: sql.raw("excluded.position_x"),
          positionY: sql.raw("excluded.position_y"),
          updatedAt: new Date(),
        },
      });
  };
  await upsertNodes(topLevel);
  await upsertNodes(nested);
  const graphCues = graph.cues ?? [];
  if (graphCues.length > 0) {
    await tx.insert(graphCuesTable).values(
      graphCues.map((cue) => ({
        id: cue.id,
        graphId: row.id,
        sceneId: cue.owner.kind === "scene" ? cue.owner.sceneId : null,
        blockId: cue.owner.kind === "block" ? cue.owner.blockId : null,
        name: cue.name,
      })),
    );
  }
  const graphActions = graph.actions ?? [];
  if (graphActions.length > 0) {
    const cuePositions = new Map(
      graphCues.map((cue) => [
        cue.id,
        new Map(cue.actionIds.map((actionId, position) => [actionId, position])),
      ]),
    );
    await tx.insert(graphActionsTable).values(
      graphActions.map((action) => ({
        id: action.id,
        graphId: row.id,
        cueId: action.cueId,
        position: cuePositions.get(action.cueId)?.get(action.id) ?? 0,
        kind: action.kind,
        targetSceneId: action.targetSceneId,
      })),
    );
  }

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
        conversion: edge.kind === "wiring" ? (edge.conversion ?? null) : null,
        layout: edge.layout ?? null,
        // `target_variable_id` is a generated column — the database
        // derives it from `target_path`, so it isn't written here.
        cueId: edge.kind === "navigate" ? edge.cueId : null,
        actionId: edge.kind === "navigate" ? edge.actionId : null,
      })),
    );
  }

  return {
    graphId: row.id,
    graph: { ...graph, showId, state, updatedAt: now, version },
  };
}
async function resolveBindingCanvas(
  tx: Tx,
  graphId: string,
  binding: EventBinding,
): Promise<EventBinding> {
  const ownerColumns = { sceneNodeId: canvases.sceneNodeId, blockId: canvases.blockId };
  const [target] = await tx
    .select({ id: canvases.id, ...ownerColumns })
    .from(canvases)
    .where(and(eq(canvases.id, binding.canvasId), eq(canvases.graphId, graphId)));
  if (!target) {
    const [source] = await tx
      .select(ownerColumns)
      .from(canvases)
      .where(eq(canvases.id, binding.canvasId));
    if (!source || (!source.sceneNodeId && !source.blockId)) {
      throw new Error(`Event Binding "${binding.id}" references an unknown Canvas.`);
    }
    const owner = source.sceneNodeId
      ? eq(canvases.sceneNodeId, source.sceneNodeId)
      : source.blockId
        ? eq(canvases.blockId, source.blockId)
        : null;
    if (!owner) throw new Error(`Event Binding "${binding.id}" references an unknown Canvas.`);
    const [mapped] = await tx
      .select({ id: canvases.id, ...ownerColumns })
      .from(canvases)
      .where(and(eq(canvases.graphId, graphId), owner));
    if (!mapped) {
      throw new Error(`Event Binding "${binding.id}" has no Canvas in graph "${graphId}".`);
    }
    return resolveBindingCanvas(tx, graphId, { ...binding, canvasId: mapped.id });
  }
  const [cue] = await tx
    .select({ sceneId: graphCuesTable.sceneId, blockId: graphCuesTable.blockId })
    .from(graphCuesTable)
    .where(and(eq(graphCuesTable.graphId, graphId), eq(graphCuesTable.id, binding.cueId)));
  if (!cue || cue.sceneId !== target.sceneNodeId || cue.blockId !== target.blockId) {
    throw new Error(`Event Binding "${binding.id}" must target a Cue owned by its Canvas.`);
  }
  return binding;
}

export async function persistEventBindings(
  tx: Tx,
  graphId: string,
  bindings: readonly EventBinding[],
): Promise<EventBinding[]> {
  await tx.delete(graphEventBindings).where(eq(graphEventBindings.graphId, graphId));
  const normalized: EventBinding[] = [];
  for (const binding of bindings) normalized.push(await resolveBindingCanvas(tx, graphId, binding));
  if (normalized.length === 0) return normalized;
  await tx.insert(graphEventBindings).values(
    normalized.map((binding) => ({
      id: binding.id,
      graphId,
      canvasId: binding.canvasId,
      elementId: binding.elementId,
      eventKind: binding.eventKind,
      params: binding.eventKind === "keypress" ? binding.params : {},
      cueId: binding.cueId,
      position: binding.position,
    })),
  );
  return normalized;
}
