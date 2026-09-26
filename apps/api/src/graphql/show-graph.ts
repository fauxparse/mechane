// The Show graph/graph-edits slice (issue #38): the GraphQL ⇄ domain
// boundary for the Show graph — the SDL for its node, edge, Shape, Block and
// interaction vocabulary, the queries and mutations that serve it, and the
// serialization that turns loosely-typed mutation input into
// @mechane/domain's `ShowGraph` and a stored graph back into the shape the
// schema's types describe.
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
import type {
  CanvasWorkspaceEdit,
  FlatCanvasEdit,
  FlatGraphEdit,
  GraphEdit,
} from "@mechane/commands";
import {
  CanvasEditCodecError,
  CanvasEditError,
  decodeCanvasWorkspaceEdit,
  decodeGraphEdit,
  encodeGraphEdit,
  GraphEditCodecError,
  isCanvasWorkspaceEditType,
} from "@mechane/commands";
import { GRAPH_COMMAND_TYPES } from "@mechane/commands";
import type { Block } from "@mechane/domain/blocks";
import {
  findShowVariableReferences,
  type GraphEdge,
  type GraphNode,
  transformerInputType,
  transformerOutputType,
  wiringTargetVariableId,
} from "@mechane/domain/graph";
import { InvalidInteractionError } from "@mechane/domain/interactions";
import { sourceDefaultsFor } from "@mechane/domain/source-defaults";
import { eq } from "drizzle-orm";
import { GraphQLError } from "graphql";

import { db } from "../db/client";
import { readCanvasWorkspace } from "../db/canvas";
import { shows } from "../db/schema";
import {
  applyShowEdits as applyShowEditsToDb,
  CanvasFormulaPublicationError,
  GraphVersionConflictError,
  publishShowGraph,
  readShowGraph,
} from "../db/show-graph";
import type { StoredShowGraph } from "../db/show-graph";
import { flattenCanvasElements } from "./canvas";
import type { Resolvers } from "./context";
import { requireUserId } from "./context";
import { findOwnShowOrThrow, validGraphState } from "./show";

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
    case "update":
      return "UpdateEdge";
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
    perConnection: null as boolean | null,
    size: null as { width: number; height: number } | null,
    columnSizes: null as Record<string, number> | null,
  };
  const encoded = encodeGraphEdit(edit);
  return {
    ...base,
    ...encoded,
    ...(edit.type === GRAPH_COMMAND_TYPES.addNode ? { node: serializeGraphNode(edit.node) } : {}),
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
    nodes: graph.nodes.map((node) => serializeGraphNode(node, graph)),
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
      ownerKind: cue.owner.kind,
      sceneId: cue.owner.kind === "scene" ? cue.owner.sceneId : null,
      blockId: cue.owner.kind === "block" ? cue.owner.blockId : null,
      actionIds: [...cue.actionIds],
      parameters: (cue.parameters ?? []).map((parameter) => ({
        id: parameter.id,
        name: parameter.name,
        type: parameter.type,
        position: parameter.position,
      })),
    })),
    actions: (graph.actions ?? []).map((action) => ({
      id: action.id,
      cueId: action.cueId,
      kind: action.kind,
      targetSceneId: action.kind === "navigate" ? action.targetSceneId : null,
      targetSourceId: action.kind === "update" ? action.target.sourceId : null,
      params:
        action.kind === "update"
          ? { fieldPath: action.target.fieldPath, operation: action.operation }
          : null,
      layout: action.layout ?? null,
    })),
    eventBindings: (graph.eventBindings ?? []).map((binding) => ({
      id: binding.id,
      canvasId: binding.canvasId,
      elementId: binding.elementId,
      eventKind: binding.eventKind,
      params: binding.eventKind === "keypress" ? binding.params : null,
      parameterMappings: binding.parameterMappings ?? [],
      cueId: binding.cueId,
      position: binding.position,
    })),
    slotEventBindings: (graph.slotEventBindings ?? []).map((binding) => ({
      id: binding.id,
      slotElementId: binding.slotElementId,
      sourceCueId: binding.sourceCueId,
      targetCueId: binding.targetCueId,
      position: binding.position,
      parameterMappings: binding.parameterMappings,
    })),
    losses: graph.losses ?? [],
  };
}

function serializeShape(shape: import("@mechane/domain/shapes").Shape) {
  return {
    id: shape.id,
    name: shape.name,
    fields: shape.fields.map((field, position) => ({ ...field, position })),
  };
}

export function serializeGraphNode(node: GraphNode, graph?: StoredShowGraph) {
  const transform =
    node.kind !== "transformer"
      ? null
      : node.transform.kind === "calculate"
        ? {
            __typename: "CalculateTransform",
            kind: "calculate",
            formula: node.transform.formula,
            outputType: node.transform.outputType,
          }
        : node.transform.kind === "filter"
          ? { __typename: "FilterTransform", kind: "filter", formula: node.transform.formula }
          : { __typename: "ShuffleTransform", kind: "shuffle" };
  return {
    id: node.id,
    kind: node.kind,
    name: node.name,
    parentId: node.parentId,
    color: node.color ?? null,
    position: node.position,
    size: node.kind === "flow" ? (node.size ?? null) : null,
    defaultSceneId: node.kind === "flow" ? node.defaultSceneId : null,
    variables:
      node.kind === "scene"
        ? node.variables.map((variable) => ({ ...variable, type: variable.type ?? null }))
        : [],
    ports:
      node.kind === "transformer"
        ? node.ports.map((port) => ({
            ...port,
            type: graph ? transformerInputType(graph, node, port.id) : null,
          }))
        : [],
    transform,
    type:
      node.kind === "source"
        ? node.type
        : node.kind === "transformer" && graph
          ? transformerOutputType(graph, node)
          : null,
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
    layout: edge.layout ?? null,
    fieldMapping: edge.kind === "wiring" ? (edge.fieldMapping ?? null) : null,
    conversion: edge.kind === "wiring" ? (edge.conversion ?? null) : null,
    // Derived, not stored input: the head of a wiring edge's target path
    // is the Variable it lands on, and a client that only cares which
    // Variable is fed shouldn't have to know that.
    targetVariableId:
      edge.kind === "wiring" && edge.targetPath.length > 0 ? wiringTargetVariableId(edge) : null,
    cueId: edge.kind === "navigate" || edge.kind === "update" ? edge.cueId : null,
    actionId: edge.kind === "navigate" || edge.kind === "update" ? edge.actionId : null,
  };
}

function toShapeValue(value: unknown, type: unknown): unknown {
  if (typeof type === "string") return { kind: type, value };
  if (type && typeof type === "object" && "kind" in type) {
    if (type.kind === "array") return { kind: "array", value };
    if (type.kind === "shape") return { kind: "object", value };
  }
  return null;
}

export const typeDefs = /* GraphQL */ `
  "Free-form canvas coordinates for a graph node (issue #25 — no auto-layout)."
  type Position {
    x: Float!
    y: Float!
  }

  "A named port on a Scene. A wiring edge targets one of these, not the Scene as a whole."
  type SceneVariable {
    id: ID!
    name: String!
    rank: String
    type: Type
    defaultValue: JSON
    suggestedDimensions: SuggestedImageDimensions
  }

  type SuggestedImageDimensions {
    width: Int!
    height: Int!
  }

  "A recursive Type descriptor: primitive, array, or a named Shape reference."
  type Type {
    kind: String!
    of: Type
    shapeId: ID
  }

  input TypeInput {
    kind: String!
    of: TypeInput
    shapeId: ID
  }

  type TextValue {
    value: String!
  }
  type NumberValue {
    value: Float!
  }
  type BooleanValue {
    value: Boolean!
  }
  type ColorValue {
    value: String!
  }
  type DateValue {
    value: String!
  }
  type DateTimeValue {
    value: String!
  }
  type ObjectValue {
    value: JSON!
  }
  type ArrayValue {
    value: JSON!
  }
  union ShapeValue =
    | TextValue
    | NumberValue
    | BooleanValue
    | ImageValue
    | ColorValue
    | DateValue
    | DateTimeValue
    | ObjectValue
    | ArrayValue

  input ImageValueInput {
    assetId: ID!
  }

  input ShapeValueInput @oneOf {
    text: String
    number: Float
    boolean: Boolean
    image: ImageValueInput
    color: String
    date: String
    datetime: String
    array: JSON
  }

  type ShapeField {
    id: ID!
    name: String!
    type: Type!
    position: Int!
    required: Boolean!
    default: ShapeValue
  }

  input ShapeFieldInput {
    id: ID!
    name: String!
    type: TypeInput!
    position: Int!
    required: Boolean!
    defaultValue: JSON
  }

  type Shape {
    id: ID!
    name: String!
    fields: [ShapeField!]!
  }
  type BlockVariable {
    id: ID!
    name: String!
    type: Type!
    required: Boolean!
    defaultValue: JSON
  }

  type BlockStateOverride {
    elementId: ID!
    property: String!
    value: JSON
  }

  type BlockState {
    id: ID!
    name: String!
    isDefault: Boolean!
    overrides: [BlockStateOverride!]!
  }

  type Block {
    id: ID!
    name: String!
    canvas: Canvas!
    variables: [BlockVariable!]!
    states: [BlockState!]!
    stateSelectorVariableId: ID
  }

  input ShapeInput {
    id: ID!
    name: String!
    fields: [ShapeFieldInput!]!
  }

  type SourceFieldDefault {
    nodeId: ID!
    fieldPath: [ID!]!
    value: JSON
  }

  """
  The fields shared by every node on the Show graph. Kind-specific data is
  exposed by the concrete node types below; clients use __typename rather
  than a nullable field bag and a string discriminator.
  """
  interface GraphNode {
    id: ID!
    name: String!
    "The Flow containing this node, or null if it's Show-level."
    parentId: ID
    position: Position!
    "The node editor colorway; absent values are neutral or inherit their Flow."
    color: String
    "Persisted UI-only state for editor surfaces."
    editorMetadata: JSON
  }
  type SceneNode implements GraphNode {
    id: ID!
    name: String!
    parentId: ID
    position: Position!
    color: String
    editorMetadata: JSON
    "The Variables wiring edges can target."
    variables: [SceneVariable!]!
  }

  type FlowNode implements GraphNode {
    id: ID!
    name: String!
    parentId: ID
    color: String
    editorMetadata: JSON
    position: Position!
    "The Flow's authored design-time size; absent means fit around children."
    size: JSON
    "The Flow's design-time entry Scene, if one is set."
    defaultSceneId: ID
  }

  type SourceNode implements GraphNode {
    id: ID!
    name: String!
    parentId: ID
    position: Position!
    color: String
    editorMetadata: JSON
    type: Type!
    "Sparse default overrides for Source fields, keyed by stable field ids."
    fieldDefaults: [SourceFieldDefault!]!
  }
  type TransformerPort {
    id: ID!
    name: String!
    rank: String
    "The effective Type delivered by the connected producer."
    type: Type
  }
  interface TransformerTransform {
    kind: String!
  }
  type CalculateTransform implements TransformerTransform {
    kind: String!
    formula: String
    outputType: Type
  }
  type FilterTransform implements TransformerTransform {
    kind: String!
    formula: String!
  }
  type ShuffleTransform implements TransformerTransform {
    kind: String!
  }
  type TransformerNode implements GraphNode {
    id: ID!
    name: String!
    parentId: ID
    position: Position!
    color: String
    editorMetadata: JSON
    "The effective output Type; derived for Filter and Shuffle."
    type: Type
    ports: [TransformerPort!]!
    transform: TransformerTransform!
  }

  type DeviceNode implements GraphNode {
    id: ID!
    name: String!
    parentId: ID
    position: Position!
    color: String
    editorMetadata: JSON
    "Whether each connection is its own logical instance."
    perConnection: Boolean!
    "The server-minted pairing code, absent before the first save."
    pairingCode: String
  }

  """
  The fields shared by every edge on the Show graph. Edge-specific data is
  exposed by the concrete edge types below; clients use __typename rather
  than a nullable field bag and a string discriminator.
  """
  interface GraphEdge {
    id: ID!
    sourceId: ID!
    targetId: ID!
    sourcePath: [String!]!
    targetPath: [String!]!
    "Where the author has dragged this edge's runs, keyed by route shape (#475)."
    layout: JSON
  }

  type WiringEdge implements GraphEdge {
    id: ID!
    sourceId: ID!
    targetId: ID!
    sourcePath: [String!]!
    targetPath: [String!]!
    "Where the author has dragged this edge's runs, keyed by route shape (#475)."
    layout: JSON
    "Resolved stable field-id mapping."
    fieldMapping: JSON
    "The value conversion this edge declares before its types are compared (#532)."
    conversion: String
    "The Scene Variable this edge feeds — the head of targetPath."
    targetVariableId: ID
  }

  type NavigateEdge implements GraphEdge {
    id: ID!
    sourceId: ID!
    targetId: ID!
    sourcePath: [String!]!
    targetPath: [String!]!
    "Where the author has dragged this edge's runs, keyed by route shape (#475)."
    layout: JSON
    "The Cue/Action pairing this transition represents."
    cueId: ID
    actionId: ID
  }

  type UpdateEdge implements GraphEdge {
    id: ID!
    sourceId: ID!
    targetId: ID!
    sourcePath: [String!]!
    targetPath: [String!]!
    layout: JSON
    cueId: ID
    actionId: ID
  }
  type DeviceEdge implements GraphEdge {
    id: ID!
    sourceId: ID!
    targetId: ID!
    sourcePath: [String!]!
    targetPath: [String!]!
    "Where the author has dragged this edge's runs, keyed by route shape (#475)."
    layout: JSON
  }

  type EventBinding {
    id: ID!
    canvasId: ID!
    elementId: ID!
    eventKind: String!
    "Per-kind payload. Null for kinds that take no parameters."
    params: JSON
    parameterMappings: JSON!
    cueId: ID!
    position: Int!
  }
  type CueParameter {
    id: ID!
    name: String!
    type: JSON!
    position: Int!
  }
  type Cue {
    id: ID!
    name: String!
    ownerKind: String!
    sceneId: ID
    blockId: ID
    actionIds: [ID!]!
    parameters: [CueParameter!]!
  }
  type SlotEventBinding {
    id: ID!
    slotElementId: ID!
    sourceCueId: ID!
    targetCueId: ID!
    position: Int!
    parameterMappings: JSON!
  }
  interface Action {
    id: ID!
    cueId: ID!
    kind: String!
    targetSceneId: ID
    targetSourceId: ID
    params: JSON
    layout: JSON
  }
  type NavigateAction implements Action {
    id: ID!
    cueId: ID!
    kind: String!
    targetSceneId: ID!
    targetSourceId: ID
    params: JSON
    layout: JSON
  }
  type UpdateAction implements Action {
    id: ID!
    cueId: ID!
    kind: String!
    targetSceneId: ID
    targetSourceId: ID!
    params: JSON!
    layout: JSON
  }

  type PublishLoss {
    sourceId: ID!
    fieldId: ID!
    fieldName: String!
    path: [String!]!
    reason: String!
  }
  "A Show's graph in one state. Draft and published are independently readable (ADR-0002)."
  type ShowGraph {
    showId: ID!
    "Either draft or published."
    state: String!
    nodes: [GraphNode!]!
    edges: [GraphEdge!]!
    shapes: [Shape!]!
    blocks: [Block!]!
    cues: [Cue!]!
    actions: [Action!]!
    eventBindings: [EventBinding!]!
    slotEventBindings: [SlotEventBinding!]!
    "Sparse graph-owned Source values, keyed by Source node and field path."
    sourceFieldDefaults: [SourceFieldDefault!]!
    updatedAt: String!
    """
    How many times this graph has been written. An edit batch names the
    version it was composed against, and is refused if that isn't the
    version stored — see \`applyShowEdits\`.
    """
    version: Int!
    "Fields that lost data while this graph was published."
    losses: [PublishLoss!]!
  }
  type VariableReference {
    kind: String!
    ownerId: ID!
    path: [String!]!
  }

  input PositionInput {
    x: Float!
    y: Float!
  }

  input SuggestedImageDimensionsInput {
    width: Int!
    height: Int!
  }
  input SceneVariableInput {
    id: ID!
    name: String!
    rank: String
    type: TypeInput
    defaultValue: JSON
    suggestedDimensions: SuggestedImageDimensionsInput
  }
  input TransformerPortInput {
    id: ID!
    name: String!
    rank: String
  }

  input GraphNodeInput {
    id: ID!
    kind: String!
    name: String!
    parentId: ID
    defaultSceneId: ID
    color: String
    type: TypeInput
    position: PositionInput!
    variables: [SceneVariableInput!]
    ports: [TransformerPortInput!]
    transformKind: String
    formula: String
    outputType: TypeInput
    size: JSON
    """
    Device nodes only: whether each connection is its own instance.
    Defaults to false for a new Device. There is no pairingCode input:
    codes are minted server-side.
    """
    perConnection: Boolean
  }
  input GraphEdgeInput {
    id: ID!
    kind: String!
    sourceId: ID!
    targetId: ID!
    sourcePath: [String!]
    targetPath: [String!]
    fieldMapping: JSON
    "The value conversion this edge declares before its types are compared (#532)."
    conversion: String
    "Where the author has dragged this edge's runs, keyed by route shape (#475)."
    layout: JSON
    cueId: ID
    actionId: ID
  }
  input CueInput {
    id: ID!
    name: String!
    ownerKind: String!
    sceneId: ID
    blockId: ID
    actionIds: [ID!]!
  }
  input ActionInput {
    id: ID!
    cueId: ID!
    kind: String!
    targetSceneId: ID
    targetSourceId: ID
    params: JSON
    layout: JSON
  }
  input EventBindingInput {
    id: ID!
    canvasId: ID!
    elementId: ID!
    eventKind: String!
    params: JSON
    parameterMappings: JSON
    cueId: ID!
    position: Int!
  }
  type GraphEdit {
    type: String!
    nodeId: ID
    node: GraphNode
    edgeId: ID
    edge: GraphEdge
    position: Position
    parentId: ID
    "The Shape target for shape commands."
    shapeId: ID
    shape: Shape
    "The Shape Field target for shape commands."
    fieldId: ID
    field: ShapeField
    fieldType: Type
    defaultValue: JSON
    required: Boolean
    "The Show node editor colorway for graph.setNodeColor."
    color: String
    "The Source node Type, for graph.setSourceType."
    sourceType: Type
    "The graph-owned Source field path for graph.setSourceFieldDefault."
    fieldPath: [ID!]
    "The wiring edge's stable source-field to target-field mapping."
    fieldMapping: JSON
    "The edge layout, for graph.setEdgeLayout; null clears it."
    layout: JSON
    "The authored Flow size for graph.setFlowSize; null clears it."
    size: JSON
    "Persisted Source table column widths for graph.setSourceColumnSizes."
    columnSizes: JSON
    "The graph-owned Source field value; null clears the override."
    value: JSON
    "The Block target for Block lifecycle and variable commands."
    block: Block
    blockId: ID
    blockVariables: JSON
    "Interaction command payloads."
    cue: Cue
    action: Action
    binding: EventBinding
    "Event Binding key payloads: graph.setEventBindingKey."
    key: String
    cueId: ID
    actionId: ID
    bindingId: ID
    bindingIds: [ID!]
    actionIds: [ID!]
    targetSceneId: ID
    "Devices only: the code the server minted for a Device this batch created (#45)."
    pairingCode: String
    "Devices only: whether each connection is its own instance, for graph.setDevicePerConnection."
    perConnection: Boolean
  }
  """
  One serialisable Show edit. \`type\` selects a graph or Canvas command;
  Canvas commands additionally name the Canvas they target.
  """
  input ShowEditInput {
    type: String!
    canvasId: ID
    nodeId: ID
    node: GraphNodeInput
    edgeId: ID
    edge: GraphEdgeInput
    color: String
    "Block lifecycle and variable payloads are validated by the domain boundary."
    block: JSON
    blockId: ID
    blockVariables: JSON
    position: PositionInput
    parentId: ID
    name: String
    flowId: ID
    "Transformer command payloads."
    portId: ID
    portIds: [ID!]
    port: TransformerPortInput
    ports: [TransformerPortInput!]
    transformKind: String
    formula: String
    outputType: TypeInput
    sceneId: ID
    variableId: ID
    variableIds: [ID!]
    variable: SceneVariableInput
    "Shape command target and materialised payloads."
    shapeId: ID
    shape: ShapeInput
    fieldId: ID
    field: ShapeFieldInput
    fieldType: TypeInput
    defaultValue: JSON
    required: Boolean
    "The Variable's Type, for graph.setSceneVariableType. Null clears it."
    shapes: [ShapeInput!]
    "The Variable's Type, for graph.setSceneVariableType. Null clears it."
    variableType: TypeInput
    "The Source node Type, for graph.setSourceType."
    sourceType: TypeInput
    "The Source field path, for graph.setSourceFieldDefault."
    fieldPath: [ID!]
    "The Source field default value, for graph.setSourceFieldDefault."
    value: JSON
    "The wiring edge's stable source-field to target-field mapping."
    fieldMapping: JSON
    "The edge layout, for graph.setEdgeLayout; null clears it."
    layout: JSON
    "The authored Flow size for graph.setFlowSize; null clears it."
    size: JSON
    "Persisted Source table column widths for graph.setSourceColumnSizes."
    columnSizes: JSON
    "The interaction payloads selected by type."
    cue: CueInput
    action: ActionInput
    binding: EventBindingInput
    "Event Binding key payloads: graph.setEventBindingKey."
    key: String
    cueId: ID
    actionId: ID
    bindingId: ID
    bindingIds: [ID!]
    actionIds: [ID!]
    "Update Action target and operation payloads."
    target: JSON
    operation: JSON
    operand: JSON
    targetSceneId: ID
    elementId: ID
    rank: String
    element: JSON
    properties: JSON
    unsetProperties: [String!]
    "Devices only: whether each connection is its own instance, for graph.setDevicePerConnection."
    perConnection: Boolean
  }

  type AppliedShowEdits {
    showId: ID!
    state: String!
    updatedAt: String!
    version: Int!
    amendments: [GraphEdit!]!
  }

  type Query {
    variableReferences(showId: ID!, variableId: ID!, state: String): [VariableReference!]!
    showGraph(showId: ID!, state: String): ShowGraph!
  }

  type Mutation {
    applyShowEdits(showId: ID!, baseVersion: Int!, edits: [ShowEditInput!]!): AppliedShowEdits!
    publishShowGraph(showId: ID!): ShowGraph!
  }
`;

export const resolvers: Resolvers = {
  GraphNode: {
    __resolveType: resolveGraphNodeType,
  },
  GraphEdge: {
    __resolveType: resolveGraphEdgeType,
  },
  TransformerTransform: {
    __resolveType: (transform: { __typename: string }) => transform.__typename,
  },
  Action: {
    __resolveType: (value: { kind: string }) =>
      value.kind === "update" ? "UpdateAction" : "NavigateAction",
  },
  ShapeValue: {
    __resolveType: (value: { kind: string }) =>
      `${value.kind[0]?.toUpperCase()}${value.kind.slice(1)}Value`,
  },
  Type: {
    kind: (type: string | { kind: "array" | "shape"; of?: unknown; shapeId?: string }) =>
      typeof type === "string" ? type : type.kind,
    of: (type: { kind: "array"; of: unknown }) => (type.kind === "array" ? type.of : null),
    shapeId: (type: { kind: "shape"; shapeId: string }) =>
      type.kind === "shape" ? type.shapeId : null,
  },
  ShapeField: {
    position: (field: { position?: number }) => field.position ?? 0,
    default: (field: { defaultValue?: unknown; type: unknown }) =>
      field.defaultValue === null || field.defaultValue === undefined
        ? null
        : toShapeValue(field.defaultValue, field.type),
  },
  Query: {
    showGraph: async (
      _parent,
      { showId, state }: { showId: string; state?: string | null },
      context,
    ) => {
      const userId = requireUserId(context);
      // Ownership first: the graph is part of the Show, so it's readable
      // only to its owner.
      await findOwnShowOrThrow(showId, userId);
      const graphState = validGraphState(state ?? "draft");
      return serializeShowGraph(await readShowGraph(showId, graphState));
    },
    variableReferences: async (
      _parent,
      { showId, variableId, state }: { showId: string; variableId: string; state?: string | null },
      context,
    ) => {
      const userId = requireUserId(context);
      await findOwnShowOrThrow(showId, userId);
      const graphState = validGraphState(state ?? "draft");
      const graph = await readShowGraph(showId, graphState);
      const canvases = (await readCanvasWorkspace(showId, graphState)).canvases;
      return findShowVariableReferences(graph, variableId, canvases);
    },
  },
  Mutation: {
    applyShowEdits: async (
      _parent,
      { showId, baseVersion, edits }: { showId: string; baseVersion: number; edits: unknown[] },
      context,
    ) => {
      const userId = requireUserId(context);
      await findOwnShowOrThrow(showId, userId);
      const graphEdits: GraphEdit[] = [];
      const canvasEdits: CanvasWorkspaceEdit[] = [];
      try {
        for (const input of edits) {
          if (input === null || typeof input !== "object" || Array.isArray(input)) {
            throw new CanvasEditError("Show edit must be an object.");
          }
          const record = input as Record<string, unknown>;
          const type = record.type;
          if (typeof type !== "string") throw new CanvasEditError("Show edit type is required.");
          // Which vocabulary an edit belongs to is the codec's to say, not a
          // prefix test's: Canvas content and Artboard framing are separate
          // variants with separate prefixes (#436).
          if (isCanvasWorkspaceEditType(type)) {
            canvasEdits.push(decodeCanvasWorkspaceEdit(record as unknown as FlatCanvasEdit));
          } else {
            graphEdits.push(parseGraphEdit(record as unknown as FlatGraphEdit));
          }
        }
        const applied = await applyShowEditsToDb(showId, graphEdits, canvasEdits, baseVersion);
        await db.update(shows).set({ updatedAt: new Date() }).where(eq(shows.id, showId));
        return applied;
      } catch (error) {
        if (error instanceof GraphVersionConflictError) {
          throw new GraphQLError(error.message, { extensions: { code: "CONFLICT" } });
        }
        if (error instanceof InvalidInteractionError) {
          throw new GraphQLError(error.message, {
            extensions: { code: "BAD_USER_INPUT", reason: error.reason },
          });
        }
        if (error instanceof CanvasEditError || error instanceof CanvasEditCodecError) {
          throw new GraphQLError(error.message, { extensions: { code: "BAD_USER_INPUT" } });
        }
        throw error;
      }
    },
    publishShowGraph: async (_parent, { showId }: { showId: string }, context) => {
      const userId = requireUserId(context);
      await findOwnShowOrThrow(showId, userId);
      try {
        return serializeShowGraph(await publishShowGraph(showId));
      } catch (error) {
        if (error instanceof CanvasFormulaPublicationError) {
          throw new GraphQLError(error.message, {
            extensions: {
              code: "BAD_USER_INPUT",
              diagnostics: error.diagnostics,
            },
          });
        }
        throw error;
      }
    },
  },
};
