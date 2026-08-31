// The GraphQL ⇄ domain boundary for the Show graph (issue #38): turning
// loosely-typed mutation input into @mechane/domain's `ShowGraph`, and a
// stored graph back into the shape the schema's types describe.
//
// GraphQL can express "a node has a kind" but not "a Flow never has a
// parent" — so the input types are one flat node/edge shape each, and this
// module is where that flattening is undone before the domain's
// `assertValidShowGraph` sees it. Anything malformed becomes a
// BAD_USER_INPUT GraphQLError here rather than a generic "Unexpected
// error" further in.
//
// The flattening itself is not written here: an edit's flat shape and the
// two halves of its translation live in one descriptor per edit type in
// @mechane/commands' `graph-edit-codec` (#347), so this module is an adapter
// over it. What stays here is what is genuinely GraphQL's: turning a codec
// refusal into BAD_USER_INPUT, and refusing on the way *in* the one edit
// that only ever travels out (#111).
import type { FlatGraphEdit, GraphEdit } from "@mechane/commands";
import { decodeGraphEdit, encodeGraphEdit, GraphEditCodecError } from "@mechane/commands";
import { GRAPH_COMMAND_TYPES } from "@mechane/commands";
import type { Block, GraphEdge, GraphNode } from "@mechane/domain";
import { sourceDefaultsFor, wiringTargetVariableId } from "@mechane/domain";
import { GraphQLError } from "graphql";

import type { StoredShowGraph } from "../db/show-graph";
import { flattenCanvasElements } from "./canvas";

interface SerializedBlock {
  id: string;
  name: string;
  canvas: {
    id: string;
    kind: string;
    elements: unknown[];
  };
  variables: Block["variables"];
  states: Block["states"];
  stateSelectorVariableId: string | null | undefined;
}

function badInput(message: string): GraphQLError {
  return new GraphQLError(message, { extensions: { code: "BAD_USER_INPUT" } });
}

/** Resolves the domain discriminator to the concrete GraphQL node type. */
export function resolveGraphNodeType(node: Pick<GraphNode, "kind">): string {
  switch (node.kind) {
    case "scene":
      return "SceneNode";
    case "flow":
      return "FlowNode";
    case "source":
      return "SourceNode";
    case "transformer":
      return "TransformerNode";
    case "device":
      return "DeviceNode";
    default:
      throw new GraphQLError(`Unknown graph node kind "${node.kind}".`);
  }
}

/** Resolves the domain edge discriminator to the concrete GraphQL edge type. */
export function resolveGraphEdgeType(edge: Pick<GraphEdge, "kind">): string {
  switch (edge.kind) {
    case "wiring":
      return "WiringEdge";
    case "navigate":
      return "NavigateEdge";
    case "device":
      return "DeviceEdge";
    default:
      throw new GraphQLError(`Unknown graph edge kind "${edge.kind}".`);
  }
}

/**
 * One edit, from wire input to the command layer's own type (#103).
 *
 * Two things happen here, and only these two. The translation is the codec's
 * (`decodeGraphEdit`), including the envelope checks — "a rename needs a
 * name" is a fact about the edit vocabulary, not about GraphQL, and it has to
 * hold for every surface that decodes one. What is GraphQL's is the error
 * shape a client sees, and who is allowed to say what.
 *
 * Neither the codec nor this function looks at the graph: whether the node
 * being renamed exists is the command's business when the batch is applied,
 * and whether the result is a legal Show is `assertValidShowGraph`'s at the
 * end of it.
 */
export function parseGraphEdit(edit: FlatGraphEdit): GraphEdit {
  if (edit.type === GRAPH_COMMAND_TYPES.setDevicePairingCode) {
    // Only ever travels server -> client (#45, #111). A client naming the
    // type at all has misunderstood who decides, and being told so beats
    // having it silently ignored.
    throw badInput("Pairing codes are minted server-side and can't be set by an edit.");
  }
  try {
    return decodeGraphEdit(edit);
  } catch (error) {
    // An unknown type included: a client speaking a newer dialect than this
    // server. Refusing the batch is the only safe answer — skipping the edit
    // would leave the client believing in a graph the server never built.
    if (error instanceof GraphEditCodecError) throw badInput(error.message);
    throw error;
  }
}

/**
 * One amendment on its way *out* (#111) — the codec's flat graph-edit shape,
 * plus the one field that only ever travels this direction.
 *
 * A shared shape rather than "a pairing code response", because what the
 * server has to tell a client about a change it didn't make is the same thing
 * a realtime channel has to tell a client about a change someone *else* made
 * (ADR-0003): a list of edits. One vocabulary, sent from two places.
 */
export function serializeGraphEdit(edit: GraphEdit) {
  // Every field the output type declares, so a client selecting one this edit
  // says nothing about reads null rather than nothing. The edit's own fields
  // come from the same codec the inbound direction uses, which is the point:
  // a field cannot travel one way only.
  const base = {
    type: edit.type,
    nodeId: null as string | null,
    node: null as unknown,
    edgeId: null as string | null,
    edge: null as unknown,
    position: null as { x: number; y: number } | null,
    parentId: null as string | null,
    name: null as string | null,
    flowId: null as string | null,
    sceneId: null as string | null,
    variableId: null as string | null,
    variableIds: null as string[] | null,
    variable: null as unknown,
    variableType: null as unknown,
    sourceType: null as unknown,
    color: null as string | null,
    shapes: null as unknown[] | null,
    fieldPath: null as string[] | null,
    fieldMapping: null as Record<string, string> | null,
    value: null as unknown,
    block: null as SerializedBlock | null,
    blockId: null as string | null,
    blockVariables: null as unknown[] | null,
    pairingCode: null as string | null,
    perConnection: null as boolean | null,
  };
  const encoded = encodeGraphEdit(edit);
  return {
    ...base,
    ...encoded,
    ...(edit.type === GRAPH_COMMAND_TYPES.addNode ? { node: serializeNode(edit.node) } : {}),
    ...(edit.type === GRAPH_COMMAND_TYPES.addEdge ? { edge: serializeEdge(edit.edge) } : {}),
    ...(edit.type === GRAPH_COMMAND_TYPES.addBlock ||
    edit.type === GRAPH_COMMAND_TYPES.duplicateBlock
      ? { block: serializeBlock(edit.block) }
      : {}),
  };
}
export function serializeBlock(block: Block): SerializedBlock {
  const canvas = block.canvas;
  return {
    id: block.id,
    name: block.name,
    // A Block's Canvas travels as content only: where its Artboard sits, and
    // who owns it, are framing facts the Canvas workspace query carries (#436).
    canvas: {
      id: canvas.id,
      kind: canvas.kind ?? "block",
      elements: flattenCanvasElements(canvas.root),
    },
    variables: block.variables,
    states: block.states,
    stateSelectorVariableId: block.stateSelectorVariableId ?? null,
  };
}

/**
 * The wire shape of a graph. Graph nodes retain their domain `kind` internally
 * so GraphQL's GraphNode interface resolver can select the concrete output
 * type; `kind` is not exposed as a GraphQL field. Inputs remain flat because
 * GraphQL has no input unions.
 */
export function serializeShowGraph(graph: StoredShowGraph) {
  return {
    showId: graph.showId,
    state: graph.state,
    updatedAt: graph.updatedAt.toISOString(),
    // What the next edit batch has to be composed against (#103).
    version: graph.version,
    nodes: graph.nodes.map((node) => serializeNode(node, graph)),
    edges: graph.edges.map(serializeEdge),
    shapes: (graph.shapes ?? []).map(serializeShape),
    blocks: (graph.blocks ?? []).map(serializeBlock),
    sourceFieldDefaults: (graph.sourceFieldDefaults ?? []).map((fieldDefault) => ({
      nodeId: fieldDefault.nodeId,
      fieldPath: fieldDefault.fieldPath,
      value: fieldDefault.value,
    })),
    cues: (graph.cues ?? []).map((cue) => ({
      id: cue.id,
      name: cue.name,
      sceneId: cue.sceneId,
      actionIds: [...cue.actionIds],
    })),
    actions: (graph.actions ?? []).map((action) => ({
      id: action.id,
      cueId: action.cueId,
      kind: action.kind,
      targetSceneId: action.targetSceneId,
    })),
    eventBindings: (graph.eventBindings ?? []).map((binding) => ({
      id: binding.id,
      canvasId: binding.canvasId,
      elementId: binding.elementId,
      eventKind: binding.eventKind,
      cueId: binding.cueId,
    })),
    losses: graph.losses ?? [],
  };
}

function serializeShape(shape: import("@mechane/domain").Shape) {
  return {
    id: shape.id,
    name: shape.name,
    fields: shape.fields.map((field, position) => ({ ...field, position })),
  };
}

function serializeNode(node: GraphNode, graph?: Pick<StoredShowGraph, "sourceFieldDefaults">) {
  return {
    id: node.id,
    kind: node.kind,
    name: node.name,
    parentId: node.parentId,
    color: node.color ?? null,
    position: node.position,
    variables:
      node.kind === "scene"
        ? node.variables.map((variable) => ({ ...variable, type: variable.type ?? null }))
        : [],
    type: node.kind === "source" || node.kind === "transformer" ? (node.type ?? null) : null,
    fieldDefaults: node.kind === "source" && graph ? sourceDefaultsFor(graph, node.id) : [],
    perConnection: node.kind === "device" && node.perConnection,
    pairingCode: node.kind === "device" ? node.pairingCode : null,
  };
}

function serializeEdge(edge: GraphEdge) {
  return {
    id: edge.id,
    kind: edge.kind,
    sourceId: edge.sourceId,
    targetId: edge.targetId,
    sourcePath: edge.sourcePath,
    targetPath: edge.targetPath,
    fieldMapping: edge.kind === "wiring" ? (edge.fieldMapping ?? null) : null,
    // Derived, not stored input: the head of a wiring edge's target path
    // is the Variable it lands on, and a client that only cares which
    // Variable is fed shouldn't have to know that.
    targetVariableId:
      edge.kind === "wiring" && edge.targetPath.length > 0 ? wiringTargetVariableId(edge) : null,
    cueId: edge.kind === "navigate" ? edge.cueId : null,
    actionId: edge.kind === "navigate" ? edge.actionId : null,
  };
}
